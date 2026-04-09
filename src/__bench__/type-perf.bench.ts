/**
 * Type-level performance benchmark.
 *
 * Run with:
 *   npx tsc --noEmit --extendedDiagnostics -p tsconfig.typeperf.json
 *
 * This file exercises Paths and Get against types of escalating complexity
 * to isolate their instantiation cost. Compare the "Instantiations" and
 * "Check time" numbers between implementations.
 */
import type { Get, Paths } from '../index';

// ── Tier 1: Flat object (10 keys, depth 1) ──────────────
interface Flat {
  a: string;
  b: number;
  c: boolean;
  d: string;
  e: number;
  f: boolean;
  g: string;
  h: number;
  i: boolean;
  j: string;
}

type _F1 = Paths<Flat>;
type _F2 = Get<Flat, 'a'>;
type _F3 = Get<Flat, 'j'>;

// ── Tier 2: Nested object (3 levels, ~15 keys) ──────────
interface Nested {
  user: {
    name: string;
    age: number;
    address: {
      street: string;
      city: string;
      zip: number;
    };
    settings: {
      theme: string;
      locale: string;
    };
  };
  posts: Array<{
    id: number;
    title: string;
    tags: string[];
  }>;
  count: number;
}

type _N1 = Paths<Nested>;
type _N2 = Get<Nested, 'user.address.city'>;
type _N3 = Get<Nested, 'user.settings.theme'>;

// ── Tier 3: Wide object (30 keys, depth 2) ──────────────
interface Wide {
  k01: { a: string; b: number };
  k02: { a: string; b: number };
  k03: { a: string; b: number };
  k04: { a: string; b: number };
  k05: { a: string; b: number };
  k06: { a: string; b: number };
  k07: { a: string; b: number };
  k08: { a: string; b: number };
  k09: { a: string; b: number };
  k10: { a: string; b: number };
  k11: { a: string; b: number };
  k12: { a: string; b: number };
  k13: { a: string; b: number };
  k14: { a: string; b: number };
  k15: { a: string; b: number };
  k16: { a: string; b: number };
  k17: { a: string; b: number };
  k18: { a: string; b: number };
  k19: { a: string; b: number };
  k20: { a: string; b: number };
  k21: { a: string; b: number };
  k22: { a: string; b: number };
  k23: { a: string; b: number };
  k24: { a: string; b: number };
  k25: { a: string; b: number };
  k26: { a: string; b: number };
  k27: { a: string; b: number };
  k28: { a: string; b: number };
  k29: { a: string; b: number };
  k30: { a: string; b: number };
}

type _W1 = Paths<Wide>;
type _W2 = Get<Wide, 'k01.a'>;
type _W3 = Get<Wide, 'k30.b'>;

// ── Tier 4: Recursive types (stress test) ────────────────
interface TreeNode {
  value: string;
  children: TreeNode[];
}

interface LinkedList {
  data: number;
  next: LinkedList | null;
}

interface RecursiveStore {
  tree: TreeNode;
  list: LinkedList;
  meta: { version: number; name: string };
}

type _R1 = Paths<RecursiveStore>;
type _R2 = Get<RecursiveStore, 'tree.value'>;
type _R3 = Get<RecursiveStore, 'list.next'>;

// ── Tier 5: Realistic zustand store ──────────────────────
interface AppState {
  auth: {
    user: {
      id: string;
      email: string;
      profile: {
        displayName: string;
        avatar: string | null;
        preferences: {
          theme: 'light' | 'dark' | 'system';
          language: string;
          notifications: boolean;
        };
      };
    } | null;
    token: string | null;
    isLoading: boolean;
  };
  todos: Array<{
    id: string;
    text: string;
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
    subtasks: Array<{
      id: string;
      text: string;
      done: boolean;
    }>;
  }>;
  ui: {
    sidebar: { open: boolean; width: number };
    modal: { visible: boolean; content: string | null };
    filters: {
      search: string;
      status: 'all' | 'active' | 'completed';
      priority: 'all' | 'low' | 'medium' | 'high';
    };
  };
}

type _A1 = Paths<AppState>;
type _A2 = Get<AppState, 'auth.user'>;
type _A3 = Get<AppState, 'ui.filters.status'>;
type _A4 = Get<AppState, 'ui.sidebar.open'>;

// Force evaluation — prevents dead-code elimination by the checker
type _Assert<T extends string> = T;
type _Use = _Assert<_F1> | _Assert<_N1> | _Assert<_W1> | _Assert<_R1> | _Assert<_A1>;
type _UseGet = _F2 | _F3 | _N2 | _N3 | _W2 | _W3 | _R2 | _R3 | _A2 | _A3 | _A4;
