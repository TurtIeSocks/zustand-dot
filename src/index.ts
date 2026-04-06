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

// Helper to prevent traversing into functions
type NonFunction =
  | object
  | string
  | number
  | boolean
  | symbol
  | undefined
  | null;

/**
 * DotPath<T>
 * Generates all valid dot-notation paths for object T.
 * - Stops at functions.
 * - Arrays support `${number}` or specific indices.
 */
// biome-ignore lint/complexity/noBannedTypes: Function is used as a type constraint to filter out callable types from path traversal
export type DotPath<T> = T extends Function
  ? never
  : T extends Array<infer U>
    ? `${number}` | `${number}.${DotPath<U>}`
    : T extends object
      ? {
          [K in keyof T & (string | number)]:
            | `${K}`
            | (T[K] extends NonFunction ? `${K}.${DotPath<T[K]>}` : never);
        }[keyof T & (string | number)]
      : never;

/**
 * PathValue<T, P>
 * Infers the value type at path P within T.
 * - Handles optional properties (including undefined).
 * - Handles array indexing.
 */
export type PathValue<T, P extends string> = P extends `${infer K}.${infer R}`
  ? K extends keyof T
    ? PathValue<T[K], R>
    : T extends Array<infer U>
      ? PathValue<U, R> // Array access via string index (like "0")
      : never
  : P extends keyof T
    ? T[P]
    : T extends Array<infer U>
      ? U
      : never;

// ==========================================
// 2. Runtime Utilities
// ==========================================

/**
 * Parses path string into segments.
 * Handles:
 * - "a.b" -> ["a", "b"]
 * - "a[0]" -> ["a", "0"]
 * - "a['b.c']" -> ["a", "b.c"]
 */
const parsePath = (path: string): string[] => {
  // Matches:
  // 1. Property names (including array indices like '0'): [^.[\]]+
  // 2. Bracketed quotes: \['(.*?)'\] or \["(.*?)"\]
  // 3. Bracketed numbers: \[(\d+)\]
  const segments: string[] = [];
  // Revised regex to capture all cases correctly
  const regex = /[^.[\]"']+|\["([^"]*)"\]|\['([^']*)'\]/g;

  let match: RegExpExecArray | null = regex.exec(path);
  while (match !== null) {
    if (match[1] !== undefined) {
      segments.push(match[1]); // Double quotes content
    } else if (match[2] !== undefined) {
      segments.push(match[2]); // Single quotes content
    } else {
      segments.push(match[0]); // Standard property or index
    }
    match = regex.exec(path);
  }
  return segments;
};

/**
 * Safe deep get.
 * Returns raw value or undefined if path doesn't exist.
 */
const deepGet = (obj: unknown, pathSegments: string[]): unknown => {
  let current: unknown = obj;
  for (const key of pathSegments) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

/**
 * Immutable deep set.
 * - Clones objects/arrays along the path.
 * - Creates arrays for numeric keys if missing.
 * - Creates objects for string keys if missing.
 */
const deepSet = (
  obj: unknown,
  pathSegments: string[],
  valueOrUpdater: unknown
): unknown => {
  if (pathSegments.length === 0) {
    return typeof valueOrUpdater === 'function'
      ? (valueOrUpdater as (prev: unknown) => unknown)(obj)
      : valueOrUpdater;
  }

  const [head, ...tail] = pathSegments;

  // Decide structure type if creating new: numeric key -> array, else object
  const isNumericKey = !Number.isNaN(Number(head));

  // Clone current level or create new
  let nextLevel: Record<string, unknown> | unknown[];
  if (Array.isArray(obj)) {
    nextLevel = [...obj];
  } else if (obj && typeof obj === 'object') {
    nextLevel = { ...(obj as Record<string, unknown>) };
  } else {
    nextLevel = isNumericKey ? [] : {};
  }

  // Recurse
  const currentValue = (nextLevel as Record<string, unknown>)[head];
  (nextLevel as Record<string, unknown>)[head] = deepSet(
    currentValue,
    tail,
    valueOrUpdater
  );

  return nextLevel;
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
export type StoreWithPaths<T> = {
  usePath: <P extends DotPath<T>, D = undefined>(
    path: P,
    defaultValue?: D
  ) => [
    D extends undefined ? PathValue<T, P> : NonNullable<PathValue<T, P>> | D,
    (
      valOrUpdater:
        | PathValue<T, P>
        | ((prev: PathValue<T, P>) => PathValue<T, P>)
    ) => void,
  ];
  getPath: <P extends DotPath<T>, D = undefined>(
    path: P,
    defaultValue?: D
  ) => D extends undefined ? PathValue<T, P> : NonNullable<PathValue<T, P>> | D;
  setPath: <P extends DotPath<T>>(
    path: P,
    valueOrUpdater:
      | PathValue<T, P>
      | ((prev: PathValue<T, P>) => PathValue<T, P>)
  ) => void;
  resetPath: (path: DotPath<T>) => void;
};

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
  // biome-ignore lint/suspicious/noExplicitAny: Canonical zustand middleware pattern — type safety provided by the exported DotPathMiddleware cast
    (config: StateCreator<any, any, any>) =>
    (
      // biome-ignore lint/suspicious/noExplicitAny: StoreApi generic must match StateCreator
      set: StoreApi<any>['setState'],
      // biome-ignore lint/suspicious/noExplicitAny: StoreApi generic must match StateCreator
      get: StoreApi<any>['getState'],
      // biome-ignore lint/suspicious/noExplicitAny: StoreApi generic must match StateCreator
      api: StoreApi<any>
    ) => {
      const initialState = config(set, get, api);

      const initialSnapshot = structuredClone(initialState);

      // biome-ignore lint/suspicious/noExplicitAny: Bridge between untyped impl and typed StoreWithPaths interface
      const augmentedApi = api as unknown as StoreWithPaths<any>;

      // biome-ignore lint/suspicious/noExplicitAny: Return must satisfy StoreWithPaths<any> conditional generic
      augmentedApi.getPath = (path: string, defaultValue?: unknown): any => {
        const raw = deepGet(get(), parsePath(path));
        if ((raw === null || raw === undefined) && defaultValue !== undefined) {
          return defaultValue;
        }
        return raw;
      };

      augmentedApi.setPath = (path: string, valueOrUpdater: unknown) => {
        // biome-ignore lint/suspicious/noExplicitAny: Constrained by StoreApi<any>["setState"] callback signature
        set((state: any) => {
          const segments = parsePath(path);
          return deepSet(state, segments, valueOrUpdater);
        });
      };

      augmentedApi.resetPath = (path: string) => {
        const segments = parsePath(path);
        const initialValue = deepGet(initialSnapshot, segments);
        const valueToRestore =
          initialValue && typeof initialValue === 'object'
            ? structuredClone(initialValue)
            : initialValue;
        // biome-ignore lint/suspicious/noExplicitAny: Constrained by StoreApi<any>["setState"] callback signature
        set((state: any) => deepSet(state, segments, valueToRestore));
      };

      // biome-ignore lint/suspicious/noExplicitAny: Return must satisfy StoreWithPaths<any> conditional generic
      augmentedApi.usePath = (path: string, defaultValue?: unknown): any => {
        const stableDefault = useDeepCompareMemo(defaultValue);

        const segments = useMemo(() => parsePath(path), [path]);

        const selector = useCallback(
          // biome-ignore lint/suspicious/noExplicitAny: Selector param constrained by StoreApi<any> state type
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

        // biome-ignore lint/suspicious/noExplicitAny: useStore requires compatible StoreApi type
        const value = useStore(api as any, selector);

        const setter = useCallback(
          (updater: unknown) => {
            // biome-ignore lint/suspicious/noExplicitAny: Constrained by StoreApi<any>["setState"] callback signature
            set((state: any) => deepSet(state, segments, updater));
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
