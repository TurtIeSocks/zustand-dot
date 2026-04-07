import { useCallback, useMemo, useRef } from 'react';
import type { Get, Paths } from 'type-fest';
import {
  type StateCreator,
  type StoreApi,
  type StoreMutatorIdentifier,
  useStore,
} from 'zustand';

// ==========================================
// 1. Type Utilities
// ==========================================

export type ToString<T> = T extends string | number ? `${T}` : never;
export type { Get, Paths };

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
  leaf[segments[len - 1]] =
    typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: unknown) => unknown)(current)
      : valueOrUpdater;

  // Phase 3: Link clones bottom-up
  for (let i = len - 2; i >= 0; i--) {
    (stack[i] as Record<string, unknown>)[segments[i]] = stack[i + 1];
  }

  return stack[0];
};

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
 * Methods added to a Zustand store by the `dotPath` middleware.
 * Provides deep dot-path access for getting, setting, subscribing to, and resetting nested state.
 */
export interface StoreWithPaths<T> {
  usePath: <
    P extends Paths<T>,
    D extends Get<T, ToString<P>> | undefined = undefined,
  >(
    path: P,
    defaultValue?: D
  ) => [
    D extends undefined
      ? Get<T, ToString<P>>
      : NonNullable<Get<T, ToString<P>>> | D,
    (
      valOrUpdater:
        | Get<T, ToString<P>>
        | ((prev: Get<T, ToString<P>>) => Get<T, ToString<P>>)
    ) => void,
  ];
  getPath: <
    P extends Paths<T>,
    D extends Get<T, ToString<P>> | undefined = undefined,
  >(
    path: P,
    defaultValue?: D
  ) => D extends undefined
    ? Get<T, ToString<P>>
    : NonNullable<Get<T, ToString<P>>> | D;
  setPath: <P extends Paths<T>>(
    path: P,
    valueOrUpdater:
      | Get<T, ToString<P>>
      | ((prev: Get<T, ToString<P>>) => Get<T, ToString<P>>)
  ) => void;
  resetPath: (path: Paths<T>) => void;
}

// Type for the middleware configuration
type DotPathMiddleware = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<T, [...Mps, ['dotPath', unknown]], Mcs>
) => StateCreator<T, Mps, [['dotPath', unknown], ...Mcs]>;

type ExtractState<S> = S extends { getState: () => infer T } ? T : never;
type Write<T, U> = Omit<T, keyof U> & U;

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    dotPath: Write<S, StoreWithPaths<ExtractState<S>>>;
  }
}

const dotPathImpl =
  (config: StateCreator<any, any, any>) =>
  (
    set: StoreApi<any>['setState'],
    get: StoreApi<any>['getState'],
    api: StoreApi<any>
  ) => {
    const initialState = config(set, get, api);

    const initialSnapshot = structuredClone(initialState);

    const augmentedApi = api as unknown as StoreWithPaths<any>;

    augmentedApi.getPath = (path: string, defaultValue?: unknown): any => {
      const raw = deepGet(get(), parsePath(path));
      if ((raw === null || raw === undefined) && defaultValue !== undefined) {
        return defaultValue;
      }
      return raw;
    };

    augmentedApi.setPath = (path: string, valueOrUpdater: unknown) => {
      set(deepSet(get(), parsePath(path), valueOrUpdater), true);
    };

    augmentedApi.resetPath = (path: string) => {
      const segments = parsePath(path);
      const initialValue = deepGet(initialSnapshot, segments);
      const valueToRestore =
        initialValue && typeof initialValue === 'object'
          ? structuredClone(initialValue)
          : initialValue;
      set(deepSet(get(), segments, valueToRestore), true);
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
        (updater: unknown) => {
          set(deepSet(get(), segments, updater), true);
        },
        [segments]
      );

      return [value, setter];
    };

    return initialState;
  };

/**
 * Zustand middleware that adds deep dot-path access to your store.
 *
 * @example
 * ```ts
 * const useStore = create<State>()(
 *   dotPath((set) => ({
 *     user: { name: 'Alice', age: 30 },
 *   }))
 * );
 *
 * // In a component:
 * const [name, setName] = useStore.usePath('user.name');
 * ```
 */
export const dotPath = dotPathImpl as unknown as DotPathMiddleware;
