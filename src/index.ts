import type { Get, Paths, PathsOptions } from 'dot.paths';
import { useCallback, useMemo, useRef } from 'react';
import {
  type StateCreator,
  type StoreApi,
  type StoreMutatorIdentifier,
  useStore,
} from 'zustand';

// ==========================================
// 1. Type Utilities
// ==========================================

// Every type from the standalone `dot.paths` package (extracted from this
// repo) is re-exported under its upstream name:
// `Get` is the loose resolver (any string path), `GetStrict` constrains the
// path to `Paths<T>` for autocomplete and invalid-path rejection.
export type * from 'dot.paths';

// ==========================================
// 2. Runtime Utilities
// ==========================================

/**
 * Hoisted regex for bracket/quote path parsing.
 * Only used when the fast-path (simple dot notation) is not applicable.
 */
const BRACKET_PATH_RE = /[^.[\]"']+|\["([^"]*)"\]|\['([^']*)'\]/g;

/** Cache of parsed path segments, keyed by the original path string. */
const pathCache = new Map<string, string[]>();

/**
 * Cap on cached parsed paths. Static paths never come close; the cap only
 * bounds memory when callers build paths dynamically (`items.${id}.name`).
 */
const PATH_CACHE_MAX = 10_000;

/**
 * Parses a path string into an array of segments. Results are cached.
 *
 * Fast-path: paths without brackets or quotes use `String.split('.')`.
 * Slow-path: falls back to regex for bracket/quote syntax.
 *
 * @example
 * parsePath("a.b")       // ["a", "b"]
 * parsePath("a[0]")      // ["a", "0"]
 * parsePath("a['b.c']")  // ["a", "b.c"]
 */
const parsePath = (path: string): string[] => {
  const cached = pathCache.get(path);
  if (cached) return cached;

  let segments: string[];

  // Fast-path: simple dot notation (no brackets or quotes)
  if (path.indexOf('[') === -1) {
    segments = path.split('.');
  } else {
    // Slow-path: bracket/quote syntax requires regex
    segments = [];
    // Reset lastIndex since the regex is module-scoped with /g flag
    BRACKET_PATH_RE.lastIndex = 0;
    let match: RegExpExecArray | null = BRACKET_PATH_RE.exec(path);
    while (match !== null) {
      if (match[1] !== undefined) {
        segments.push(match[1]); // Double-quoted key
      } else if (match[2] !== undefined) {
        segments.push(match[2]); // Single-quoted key
      } else {
        segments.push(match[0]); // Unquoted segment or index
      }
      match = BRACKET_PATH_RE.exec(path);
    }
  }

  // Writing through a `__proto__` segment would hit the legacy accessor and
  // replace the target object's prototype instead of setting a plain key.
  if (segments.includes('__proto__')) {
    throw new Error(
      `zustand-dot: refusing to use path segment "__proto__" in "${path}"`
    );
  }

  if (pathCache.size >= PATH_CACHE_MAX) pathCache.clear();
  pathCache.set(path, segments);
  return segments;
};

/**
 * Safe deep get.
 * Returns raw value or undefined if path doesn't exist.
 */
const deepGet = (obj: unknown, pathSegments: string[]): unknown => {
  let current: unknown = obj;
  for (let i = 0; i < pathSegments.length; i++) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[pathSegments[i]];
  }
  return current;
};

/** Matches strings that are purely numeric (array indices). */
const NUMERIC_RE = /^\d+$/;

/**
 * Internal sentinel: makes deepSet remove the leaf key (or splice the array
 * index) instead of assigning. Used by resetPath when a path did not exist
 * in the initial state — assigning `undefined` would create an own key.
 */
const DELETE = Symbol('zustand-dot.delete');

/**
 * Immutable deep set — iterative, zero-recursion.
 *
 * Walks the path once to clone each level into a stack array,
 * applies the value at the leaf, then links clones bottom-up.
 * Avoids N recursive function calls and intermediate array allocations.
 */
const deepSet = (
  root: unknown,
  segments: string[],
  valueOrUpdater: unknown
): unknown => {
  const len = segments.length;
  if (len === 0) {
    return typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: unknown) => unknown)(root)
      : valueOrUpdater;
  }

  // Phase 1: Walk down, clone each level
  const stack: (Record<string, unknown> | unknown[])[] = new Array(len);
  let current: unknown = root;

  for (let i = 0; i < len; i++) {
    if (Array.isArray(current)) {
      stack[i] = current.slice() as unknown[];
    } else if (current != null && typeof current === 'object') {
      stack[i] = { ...(current as Record<string, unknown>) };
    } else {
      stack[i] = NUMERIC_RE.test(segments[i]) ? [] : {};
    }
    current =
      current != null && typeof current === 'object'
        ? (current as Record<string, unknown>)[segments[i]]
        : undefined;
  }

  // Phase 2: Apply value at the leaf
  // `current` now holds the original value at the leaf path
  const leaf = stack[len - 1] as Record<string, unknown>;
  const leafKey = segments[len - 1];
  if (valueOrUpdater === DELETE) {
    if (Array.isArray(leaf)) {
      leaf.splice(Number(leafKey), 1);
    } else {
      delete leaf[leafKey];
    }
  } else {
    leaf[leafKey] =
      typeof valueOrUpdater === 'function'
        ? (valueOrUpdater as (prev: unknown) => unknown)(current)
        : valueOrUpdater;
  }

  // Phase 3: Link clones bottom-up
  for (let i = len - 2; i >= 0; i--) {
    (stack[i] as Record<string, unknown>)[segments[i]] = stack[i + 1];
  }

  return stack[0];
};

/**
 * Deep clone for reset snapshots.
 *
 * `structuredClone` throws on functions, so it cannot snapshot the common
 * Zustand shape of state + action functions. This clone copies plain
 * objects, arrays, Date, Map, and Set; everything else (functions, class
 * instances, primitives) passes through by reference. Circular references
 * are preserved via the `seen` map.
 */
const snapshotWith = <T>(value: T, seen: WeakMap<object, unknown>): T => {
  if (value === null || typeof value !== 'object') return value;

  const existing = seen.get(value);
  if (existing !== undefined) return existing as T;

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const v of value) out.push(snapshotWith(v, seen));
    return out as unknown as T;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }
  if (value instanceof Map) {
    const out = new Map();
    seen.set(value, out);
    for (const [k, v] of value) out.set(k, snapshotWith(v, seen));
    return out as unknown as T;
  }
  if (value instanceof Set) {
    const out = new Set();
    seen.set(value, out);
    for (const v of value) out.add(snapshotWith(v, seen));
    return out as unknown as T;
  }

  const proto = Object.getPrototypeOf(value);
  // Non-plain instances (class instances, RegExp, etc.) pass by reference:
  // cloning them cannot preserve behavior generically.
  if (proto !== Object.prototype && proto !== null) return value;

  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const key of Object.keys(value)) {
    out[key] = snapshotWith((value as Record<string, unknown>)[key], seen);
  }
  return out as T;
};

/** Deep-copies `value` for reset snapshots. See {@link snapshotWith}. */
const snapshot = <T>(value: T): T => snapshotWith(value, new WeakMap());

/**
 * Deep equality check for memoization.
 * Supports: primitives, objects, arrays, Date, RegExp.
 * Ignores: Map, Set (treats as reference equal).
 */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;

  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  // Maps and Sets are reference-equal only (handled by Object.is above);
  // comparing them as plain objects would see zero keys and report equal.
  if (
    a instanceof Map ||
    b instanceof Map ||
    a instanceof Set ||
    b instanceof Set
  ) {
    return false;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // If array
  if (Array.isArray(a)) {
    const bArr = b as unknown[];
    if (a.length !== bArr.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], bArr[i])) return false;
    }
    return true;
  }

  // If plain object
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.hasOwn(objB, key) || !deepEqual(objA[key], objB[key])) {
      return false;
    }
  }

  return true;
};

// ==========================================
// 3. React Hooks
// ==========================================

/**
 * **React hook.** Returns the previous `value` reference for as long as the
 * new one is {@link deepEqual} to it, so inline object/array arguments stay
 * referentially stable across renders.
 */
function useDeepCompareMemo<T>(value: T): T {
  const ref = useRef<T>(value);

  if (!deepEqual(value, ref.current)) {
    ref.current = value;
  }

  return ref.current;
}

// ==========================================
// 4. Middleware Implementation
// ==========================================

/**
 * Methods the {@link dotPath} middleware attaches to a Zustand store.
 *
 * They live on the store API, so they are reached as properties of the hook
 * returned by `create` (`useStore.getPath(...)`) or of a vanilla store from
 * `createStore` (`store.getPath(...)`).
 *
 * | Member            | Kind                   | Reactive | Usable outside React |
 * | ----------------- | ---------------------- | -------- | -------------------- |
 * | `usePath`         | React hook             | Yes      | No                   |
 * | `getPath`         | Imperative getter      | No       | Yes                  |
 * | `setPath`         | Imperative setter      | —        | Yes                  |
 * | `resetPath`       | Imperative setter      | —        | Yes                  |
 * | `subscribePath`   | Vanilla subscription   | Yes      | Yes                  |
 *
 * **Path syntax.** Paths are dot-separated keys, with array indices written as
 * numeric segments (`'user.posts.0.title'`). The runtime parser also accepts
 * brackets (`'posts[0]'`) and quoted keys (`'config["remote.url"]'`) for keys
 * that contain a literal dot; the typed API only accepts what
 * {@link Paths | `Paths<T, O>`} generates, so those forms need a cast unless
 * `O` sets `arrays: 'bracket'`. A `__proto__` segment throws at runtime.
 *
 * @template T - The store's state type.
 * @template O - The {@link PathsOptions} passed to {@link dotPath} (for
 *   example `{ depth: 12 }`). Only affects which paths are enumerated; value
 *   types are resolved with the loose {@link Get}, which works at any depth
 *   once the path has passed the `Paths<T, O>` constraint.
 */
export interface StoreWithPaths<T, O extends PathsOptions = {}> {
  /**
   * **React hook.** Subscribes the calling component to the value at `path`
   * and returns it alongside a setter, like `useState`.
   *
   * The component re-renders only when the value at `path` changes by
   * reference (`Object.is`). Because writes use structural sharing, changes
   * elsewhere in the store never re-render it.
   *
   * Follows the Rules of Hooks: call it at the top level of a function
   * component or custom hook, never conditionally or outside React.
   *
   * @template P - The path, constrained to `Paths<T, O>` for autocomplete.
   * @template D - The type of `defaultValue`, if one is given.
   * @param path - Dot path to the value to subscribe to.
   * @param defaultValue - Returned in place of the stored value when it is
   *   `null` or `undefined`. Compared deeply between renders, so an inline
   *   `[]` or `{}` is safe and will not cause re-render loops. Hoist large
   *   defaults to a module constant to keep that comparison cheap. It is never
   *   written to the store.
   * @returns A `[value, setValue]` tuple.
   *   - `value` is the current value at `path`, or `defaultValue` when that is
   *     `null`/`undefined`. With a default, its type excludes `null` and
   *     `undefined`.
   *   - `setValue` behaves like {@link StoreWithPaths.setPath | setPath} bound to
   *     `path`. Its identity is stable across renders while `path` is
   *     unchanged, so it is safe in dependency arrays. A functional updater
   *     receives the raw stored value, **not** `defaultValue`.
   *
   * @example
   * ```tsx
   * function NameField() {
   *   // Re-renders only when user.profile.name changes
   *   const [name, setName] = useStore.usePath('user.profile.name');
   *   return <input value={name} onChange={(e) => setName(e.target.value)} />;
   * }
   * ```
   *
   * @example
   * ```tsx
   * function PostCount() {
   *   // Inline default is safe: it is compared deeply, not by reference
   *   const [posts, setPosts] = useStore.usePath('user.posts', []);
   *   const add = () =>
   *     // `prev` is the stored value, which may still be undefined
   *     setPosts((prev) => [...(prev ?? []), { id: Date.now(), title: '' }]);
   *   return <button onClick={add}>{posts.length} posts</button>;
   * }
   * ```
   *
   * @see {@link StoreWithPaths.getPath} for a non-reactive read.
   */
  usePath: <P extends Paths<T, O>, D extends Get<T, P> | undefined = undefined>(
    path: P,
    defaultValue?: D
  ) => [
    D extends undefined ? Get<T, P> : NonNullable<Get<T, P>> | D,
    (valOrUpdater: Get<T, P> | ((prev: Get<T, P>) => Get<T, P>)) => void,
  ];

  /**
   * **Imperative getter (not a hook, not reactive).** Reads the current value
   * at `path` once and returns it.
   *
   * Calling it during render does **not** subscribe the component to
   * updates; use {@link StoreWithPaths.usePath | usePath} for that. Safe to
   * call anywhere: event handlers, store actions, effects, or outside React.
   *
   * @template P - The path, constrained to `Paths<T, O>` for autocomplete.
   * @template D - The type of `defaultValue`, if one is given.
   * @param path - Dot path to the value to read.
   * @param defaultValue - Returned when the stored value is `null` or
   *   `undefined`, including when an intermediate segment is missing.
   * @returns The value at `path`, or `defaultValue` when that is
   *   `null`/`undefined`. Without a default, a missing path yields
   *   `undefined`.
   *
   * @example
   * ```ts
   * const age = useStore.getPath('user.profile.age');
   * const firstTitle = useStore.getPath('user.posts.0.title', 'Untitled');
   * ```
   *
   * @example
   * ```ts
   * // Inside an action, read and write through the store API
   * // (State here also declares `birthday: () => void`)
   * const useStore = create<State>()(
   *   dotPath((set, get, api) => ({
   *     user: { profile: { name: 'Alice', age: 30 }, posts: [] },
   *     birthday: () => api.setPath('user.profile.age', api.getPath('user.profile.age') + 1),
   *   }))
   * );
   * ```
   */
  getPath: <P extends Paths<T, O>, D extends Get<T, P> | undefined = undefined>(
    path: P,
    defaultValue?: D
  ) => D extends undefined ? Get<T, P> : NonNullable<Get<T, P>> | D;

  /**
   * **Imperative setter (not a hook).** Immutably writes a value at `path` and
   * notifies subscribers synchronously.
   *
   * Only the objects and arrays along `path` are copied; every other subtree
   * keeps its reference (structural sharing), so `usePath` and
   * `subscribePath` listeners on unrelated paths are not triggered. Missing
   * intermediate containers are created: an array when the next segment is
   * numeric, otherwise a plain object.
   *
   * Safe to call anywhere, including outside React.
   *
   * @template P - The path, constrained to `Paths<T, O>` for autocomplete.
   * @param path - Dot path to the value to write.
   * @param valueOrUpdater - The new value, or an updater
   *   `(prev) => next` that receives the current value at `path`.
   *
   * @remarks
   * Any function passed is treated as an updater, as with React's
   * `setState`. To store a function itself, return it from an updater:
   * `setPath('onSave', () => handleSave)`.
   *
   * @example
   * ```ts
   * // Direct value
   * useStore.setPath('user.profile.age', 31);
   *
   * // Functional update
   * useStore.setPath('user.posts', (posts) => [...posts, { id: 1, title: 'New' }]);
   *
   * // Array element by index
   * useStore.setPath('user.posts.0.title', 'Updated title');
   * ```
   */
  setPath: <P extends Paths<T, O>>(
    path: P,
    valueOrUpdater: Get<T, P> | ((prev: Get<T, P>) => Get<T, P>)
  ) => void;

  /**
   * **Imperative setter (not a hook).** Restores the value at `path` to what it
   * was when the store was created, and notifies subscribers synchronously.
   *
   * The initial state is deep-copied once at creation, and the restored
   * value is copied again on each reset, so later mutations cannot leak into
   * the snapshot. Plain objects, arrays, `Date`, `Map` and `Set` are copied;
   * functions (such as store actions) and class instances are kept by
   * reference, so resetting a subtree that contains actions keeps them
   * callable.
   *
   * A path that did not exist in the initial state is removed (the key is
   * deleted, or the array element spliced out) rather than set to
   * `undefined`.
   *
   * @param path - Dot path of the value or subtree to reset.
   *
   * @example
   * ```ts
   * useStore.setPath('user.profile.name', 'Bob');
   * useStore.resetPath('user.profile'); // back to { name: 'Alice', age: 30 }
   * ```
   */
  resetPath: (path: Paths<T, O>) => void;

  /**
   * **Vanilla subscription (not a hook).** Calls `listener` whenever the value
   * at `path` changes, and returns a function that unsubscribes.
   *
   * Changes are detected by reference (`Object.is`) after each store update,
   * so writes to unrelated paths never fire the listener. It is **not**
   * called with the current value on subscribe.
   *
   * Works without React. Inside a component, prefer
   * {@link StoreWithPaths.usePath | usePath} for rendering, and reach for
   * this only for side effects, cleaning up in the effect's return.
   *
   * @template P - The path, constrained to `Paths<T, O>` for autocomplete.
   * @param path - Dot path to watch.
   * @param listener - Called with the new and previous values at `path`.
   * @returns An unsubscribe function. Call it to stop listening.
   *
   * @example
   * ```ts
   * const unsubscribe = useStore.subscribePath('user.profile.name', (name, prev) => {
   *   console.log(`${prev} renamed to ${name}`);
   * });
   *
   * // Later
   * unsubscribe();
   * ```
   *
   * @example
   * ```tsx
   * // Side effect in a component, cleaned up on unmount
   * useEffect(
   *   () => useStore.subscribePath('settings.theme', (theme) => applyTheme(theme)),
   *   []
   * );
   * ```
   */
  subscribePath: <P extends Paths<T, O>>(
    path: P,
    listener: (value: Get<T, P>, previousValue: Get<T, P>) => void
  ) => () => void;
}

/**
 * Signature of {@link dotPath}. `Mps`/`Mcs` are Zustand's mutator lists, which
 * let it compose with other middleware while registering the `dotPath`
 * mutator so the store type gains {@link StoreWithPaths}.
 */
type DotPathMiddleware = <
  T,
  O extends PathsOptions = {},
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<T, [...Mps, ['dotPath', O]], Mcs>,
  options?: O
) => StateCreator<T, Mps, [['dotPath', O], ...Mcs]>;

/** State type of a store API `S`, read from its `getState` return type. */
type ExtractState<S> = S extends { getState: () => infer T } ? T : never;
/** `T` with the keys of `U` overwritten by `U`'s (Zustand's mutator idiom). */
type Write<T, U> = Omit<T, keyof U> & U;

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    /** Adds {@link StoreWithPaths} to any store created with {@link dotPath}. */
    dotPath: Write<
      S,
      StoreWithPaths<ExtractState<S>, A extends PathsOptions ? A : {}>
    >;
  }
}

const dotPathImpl =
  // The options argument only carries PathsOptions at the type level; the
  // runtime never reads it.
    (config: StateCreator<any, any, any>, _options?: unknown) =>
    (
      set: StoreApi<any>['setState'],
      get: StoreApi<any>['getState'],
      api: StoreApi<any>
    ) => {
      const initialState = config(set, get, api);

      const initialSnapshot = snapshot(initialState);

      const augmentedApi = api as unknown as StoreWithPaths<any>;

      /**
       * Applies an immutable write at `segments`.
       *
       * Reads `api.setState` on every call instead of using the `set` captured
       * above. Middleware such as `devtools`, `persist` and `immer` patch
       * `api.setState`, so this reaches them whichever side of `dotPath` they
       * were composed on.
       */
      const write = (segments: string[], valueOrUpdater: unknown) => {
        api.setState(deepSet(get(), segments, valueOrUpdater), true);
      };

      augmentedApi.getPath = (path: string, defaultValue?: unknown): any => {
        const raw = deepGet(get(), parsePath(path));
        if ((raw === null || raw === undefined) && defaultValue !== undefined) {
          return defaultValue;
        }
        return raw;
      };

      augmentedApi.setPath = (path: string, valueOrUpdater: unknown) => {
        write(parsePath(path), valueOrUpdater);
      };

      augmentedApi.resetPath = (path: string) => {
        const segments = parsePath(path);
        const initialValue = deepGet(initialSnapshot, segments);
        // A path absent from the initial state is removed rather than set to
        // `undefined`, so reset restores "was never set" faithfully.
        const valueToRestore =
          initialValue === undefined ? DELETE : snapshot(initialValue);
        write(segments, valueToRestore);
      };

      augmentedApi.subscribePath = (
        path: string,
        listener: (value: any, previousValue: any) => void
      ) => {
        const segments = parsePath(path);
        return api.subscribe((state, previousState) => {
          const value = deepGet(state, segments);
          const previousValue = deepGet(previousState, segments);
          // Structural sharing makes Object.is exact: an untouched subtree
          // keeps its reference, so only real changes fire the listener.
          if (!Object.is(value, previousValue)) {
            listener(value, previousValue);
          }
        });
      };

      augmentedApi.usePath = (path: string, defaultValue?: unknown): any => {
        const stableDefault = useDeepCompareMemo(defaultValue);

        const segments = useMemo(() => parsePath(path), [path]);

        const selector = useCallback(
          (state: any) => {
            const raw = deepGet(state, segments);
            if (
              (raw === null || raw === undefined) &&
              stableDefault !== undefined
            ) {
              return stableDefault;
            }
            return raw;
          },
          [segments, stableDefault]
        );

        const value = useStore(api as any, selector);

        const setter = useCallback(
          (updater: unknown) => write(segments, updater),
          [segments]
        );

        return [value, setter];
      };

      return initialState;
    };

/**
 * Zustand middleware that adds typed, deep dot-path access to a store.
 *
 * Wrap a state creator with it, and the resulting store gains the members of
 * {@link StoreWithPaths}: the {@link StoreWithPaths.usePath | usePath} hook,
 * plus {@link StoreWithPaths.getPath | getPath},
 * {@link StoreWithPaths.setPath | setPath},
 * {@link StoreWithPaths.resetPath | resetPath} and
 * {@link StoreWithPaths.subscribePath | subscribePath}. Paths autocomplete
 * from the state type, and invalid paths or mistyped values fail to compile.
 *
 * This is the middleware factory itself, not a hook: call it once when
 * creating the store.
 *
 * @template T - The store's state type, inferred from `create<T>()`.
 * @template O - The {@link PathsOptions} type, inferred from `options`.
 * @param initializer - The state creator, `(set, get, api) => initialState`,
 *   exactly as you would pass to `create`. Its return value is also
 *   snapshotted as the baseline for `resetPath`.
 * @param options - Type-level options for path enumeration, such as
 *   `{ depth: 12 }` to raise the default depth of 8 (max 16), or
 *   `{ arrays: 'bracket' }` to type array paths as `items[0]`. Ignored at
 *   runtime.
 * @returns A state creator to pass to `create`, `createStore`, or another
 *   middleware.
 *
 * @remarks
 * Composes with other middleware in any order. Path writes go through the
 * store's current `api.setState`, so middleware that patches it (`devtools`,
 * `persist`, `immer`) sees them whether it sits inside or outside `dotPath`.
 *
 * Middleware that only wraps the `set` it passes down, without patching
 * `api.setState`, does not see path writes in either order.
 *
 * @example
 * ```ts
 * import { create } from 'zustand';
 * import { dotPath } from 'zustand-dot';
 *
 * interface State {
 *   user: { profile: { name: string; age: number }; posts: { id: number; title: string }[] };
 * }
 *
 * export const useStore = create<State>()(
 *   dotPath(() => ({
 *     user: { profile: { name: 'Alice', age: 30 }, posts: [] },
 *   }))
 * );
 *
 * // In a component (reactive)
 * const [name, setName] = useStore.usePath('user.profile.name');
 *
 * // Anywhere (imperative)
 * useStore.setPath('user.profile.age', 31);
 * ```
 *
 * @example
 * ```ts
 * // Deeper path enumeration, alongside other middleware
 * const useStore = create<State>()(
 *   devtools(dotPath(() => initialState, { depth: 12 }))
 * );
 * ```
 */
export const dotPath = dotPathImpl as unknown as DotPathMiddleware;
