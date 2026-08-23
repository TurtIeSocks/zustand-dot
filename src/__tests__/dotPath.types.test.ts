import { describe, expectTypeOf, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { dotPath, type Get, type GetStrict, type Paths } from '../index';

interface TestState {
  user: {
    name: string;
    age: number;
    tags: string[];
  };
  items: Array<{ id: number; title: string }>;
  count: number;
  optional?: string;
}

describe('DotPath type', () => {
  it('generates top-level paths', () => {
    expectTypeOf<'user'>().toExtend<Paths<TestState>>();
    expectTypeOf<'items'>().toExtend<Paths<TestState>>();
    expectTypeOf<'count'>().toExtend<Paths<TestState>>();
  });

  it('generates nested paths', () => {
    expectTypeOf<'user.name'>().toExtend<Paths<TestState>>();
    expectTypeOf<'user.age'>().toExtend<Paths<TestState>>();
    expectTypeOf<'user.tags'>().toExtend<Paths<TestState>>();
  });

  it('generates array element paths', () => {
    expectTypeOf<`items.${number}`>().toExtend<Paths<TestState>>();
    expectTypeOf<`items.${number}.id`>().toExtend<Paths<TestState>>();
    expectTypeOf<`items.${number}.title`>().toExtend<Paths<TestState>>();
  });

  it('includes optional properties', () => {
    expectTypeOf<'optional'>().toExtend<Paths<TestState>>();
  });
});

describe('PathValue type', () => {
  it('resolves top-level types', () => {
    expectTypeOf<Get<TestState, 'count'>>().toEqualTypeOf<number>();
    expectTypeOf<Get<TestState, 'user'>>().toEqualTypeOf<TestState['user']>();
  });

  it('resolves nested types', () => {
    expectTypeOf<Get<TestState, 'user.name'>>().toEqualTypeOf<string>();
    expectTypeOf<Get<TestState, 'user.age'>>().toEqualTypeOf<number>();
  });

  it('resolves array element types', () => {
    expectTypeOf<Get<TestState, 'items'>>().toEqualTypeOf<TestState['items']>();
  });

  it('resolves optional property types', () => {
    expectTypeOf<Get<TestState, 'optional'>>().toEqualTypeOf<
      TestState['optional']
    >();
  });
});

describe('store API types', () => {
  it('getPath returns correctly typed values', () => {
    const store = createStore<TestState>()(
      dotPath(
        (): TestState => ({
          user: { name: 'Alice', age: 30, tags: [] },
          items: [],
          count: 0,
        })
      )
    );

    const name = store.getPath('user.name');
    expectTypeOf(name).toEqualTypeOf<string>();

    const age = store.getPath('user.age');
    expectTypeOf(age).toEqualTypeOf<number>();

    const count = store.getPath('count');
    expectTypeOf(count).toEqualTypeOf<number>();
  });

  it('getPath with default value adjusts return type', () => {
    const store = createStore<TestState>()(
      dotPath(
        (): TestState => ({
          user: { name: 'Alice', age: 30, tags: [] },
          items: [],
          count: 0,
        })
      )
    );

    const val = store.getPath('optional', 'fallback');
    expectTypeOf(val).toEqualTypeOf<string>();
  });

  it('setPath rejects wrong value types', () => {
    const store = createStore<TestState>()(
      dotPath(
        (): TestState => ({
          user: { name: 'Alice', age: 30, tags: [] },
          items: [],
          count: 0,
        })
      )
    );

    // Valid
    store.setPath('user.name', 'Bob');
    store.setPath('count', 42);

    // @ts-expect-error - number not assignable to string
    store.setPath('user.name', 123);

    // @ts-expect-error - string not assignable to number
    store.setPath('count', 'not a number');
  });

  it('setPath accepts functional updater with correct types', () => {
    const store = createStore<TestState>()(
      dotPath(
        (): TestState => ({
          user: { name: 'Alice', age: 30, tags: [] },
          items: [],
          count: 0,
        })
      )
    );

    store.setPath('count', (prev) => {
      expectTypeOf(prev).toEqualTypeOf<number>();
      return prev + 1;
    });
  });

  it('resetPath accepts valid paths', () => {
    const store = createStore<TestState>()(
      dotPath(
        (): TestState => ({
          user: { name: 'Alice', age: 30, tags: [] },
          items: [],
          count: 0,
        })
      )
    );

    // Valid
    store.resetPath('user');
    store.resetPath('user.name');
    store.resetPath('count');
  });
});

describe('Get / GetStrict alignment with dot.paths', () => {
  it('Get is loose: invalid paths resolve to never instead of erroring', () => {
    expectTypeOf<Get<TestState, 'nope'>>().toEqualTypeOf<never>();
    expectTypeOf<Get<TestState, 'user.nope'>>().toEqualTypeOf<never>();
  });

  it('GetStrict constrains paths and resolves identically for valid ones', () => {
    expectTypeOf<GetStrict<TestState, 'user.name'>>().toEqualTypeOf<string>();
    expectTypeOf<GetStrict<TestState, 'count'>>().toEqualTypeOf<number>();
  });
});

// ==========================================
// Depth Options
// ==========================================

interface DeepState {
  a: { b: { c: { d: { e: { f: { g: { h: { i: { j: string } } } } } } } } };
}

const deepInitial = (): DeepState => ({
  a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 'leaf' } } } } } } } } },
});

describe('configurable path depth', () => {
  it('default depth caps enumeration at 8 segments', () => {
    expectTypeOf<'a.b.c.d.e.f.g.h'>().toExtend<Paths<DeepState>>();
    expectTypeOf<'a.b.c.d.e.f.g.h.i'>().not.toExtend<Paths<DeepState>>();
  });

  it('depth option extends enumeration', () => {
    expectTypeOf<'a.b.c.d.e.f.g.h.i.j'>().toExtend<
      Paths<DeepState, { depth: 12 }>
    >();
  });

  it('store without options rejects paths beyond default depth', () => {
    const store = createStore<DeepState>()(dotPath(deepInitial));
    store.setPath('a.b.c.d.e.f.g.h', { i: { j: 'x' } });
    // @ts-expect-error - path exceeds the default depth of 8
    store.setPath('a.b.c.d.e.f.g.h.i.j', 'x');
  });

  it('store with a depth option accepts deeper paths', () => {
    const store = createStore<DeepState>()(
      dotPath(deepInitial, { depth: 12 })
    );
    store.setPath('a.b.c.d.e.f.g.h.i.j', 'x');
    const leaf = store.getPath('a.b.c.d.e.f.g.h.i.j');
    expectTypeOf(leaf).toEqualTypeOf<string>();
  });
});

describe('subscribePath types', () => {
  it('infers value and previous value from the path', () => {
    const store = createStore<TestState>()(
      dotPath(
        (): TestState => ({
          user: { name: 'Alice', age: 30, tags: [] },
          items: [],
          count: 0,
        })
      )
    );

    store.subscribePath('user.name', (value, previousValue) => {
      expectTypeOf(value).toEqualTypeOf<string>();
      expectTypeOf(previousValue).toEqualTypeOf<string>();
    });

    const unsubscribe = store.subscribePath('count', () => {});
    expectTypeOf(unsubscribe).toEqualTypeOf<() => void>();
  });
});

// ==========================================
// Recursive Types
// ==========================================

interface TreeNode {
  value: string;
  children: TreeNode[];
}

interface LinkedList {
  data: number;
  next: LinkedList | null;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
type JsonArray = JsonValue[];

interface Folder {
  name: string;
  files: FileEntry[];
}
interface FileEntry {
  name: string;
  parent: Folder;
}

interface RecursiveState {
  tree: TreeNode;
  list: LinkedList;
  json: JsonObject;
  fs: Folder;
}

describe('Recursive type: Paths generation', () => {
  it('generates paths for self-referencing tree nodes', () => {
    expectTypeOf<'tree'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<'tree.value'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<'tree.children'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<`tree.children.${number}`>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<`tree.children.${number}.value`>().toExtend<
      Paths<RecursiveState>
    >();
    expectTypeOf<`tree.children.${number}.children`>().toExtend<
      Paths<RecursiveState>
    >();
  });

  it('generates paths for nullable linked list', () => {
    expectTypeOf<'list'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<'list.data'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<'list.next'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<'list.next.data'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<'list.next.next'>().toExtend<Paths<RecursiveState>>();
  });

  it('generates paths for JSON-like recursive unions', () => {
    expectTypeOf<'json'>().toExtend<Paths<RecursiveState>>();
  });

  it('generates paths for mutually recursive types', () => {
    expectTypeOf<'fs'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<'fs.name'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<'fs.files'>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<`fs.files.${number}`>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<`fs.files.${number}.name`>().toExtend<Paths<RecursiveState>>();
    expectTypeOf<`fs.files.${number}.parent`>().toExtend<
      Paths<RecursiveState>
    >();
    expectTypeOf<`fs.files.${number}.parent.name`>().toExtend<
      Paths<RecursiveState>
    >();
  });
});

describe('Recursive type: Get resolution', () => {
  it('resolves types through self-referencing tree', () => {
    expectTypeOf<Get<RecursiveState, 'tree'>>().toEqualTypeOf<TreeNode>();
    expectTypeOf<Get<RecursiveState, 'tree.value'>>().toEqualTypeOf<string>();
    expectTypeOf<Get<RecursiveState, 'tree.children'>>().toEqualTypeOf<
      TreeNode[]
    >();
  });

  it('resolves types through nullable linked list', () => {
    expectTypeOf<Get<RecursiveState, 'list.data'>>().toEqualTypeOf<number>();
    expectTypeOf<
      Get<RecursiveState, 'list.next'>
    >().toEqualTypeOf<LinkedList | null>();
  });

  it('resolves types through mutually recursive types', () => {
    expectTypeOf<Get<RecursiveState, 'fs'>>().toEqualTypeOf<Folder>();
    expectTypeOf<Get<RecursiveState, 'fs.files'>>().toEqualTypeOf<
      FileEntry[]
    >();
    expectTypeOf<Get<RecursiveState, 'fs.name'>>().toEqualTypeOf<string>();
  });
});

describe('Recursive type: store API', () => {
  const makeStore = () =>
    createStore<RecursiveState>()(
      dotPath(
        (): RecursiveState => ({
          tree: {
            value: 'root',
            children: [{ value: 'child', children: [] }],
          },
          list: { data: 1, next: { data: 2, next: null } },
          json: { key: 'value' },
          fs: {
            name: 'root',
            files: [
              {
                name: 'readme.md',
                parent: { name: 'root', files: [] },
              },
            ],
          },
        })
      )
    );

  it('getPath infers correct types for recursive paths', () => {
    const store = makeStore();

    const treeVal = store.getPath('tree.value');
    expectTypeOf(treeVal).toEqualTypeOf<string>();

    const children = store.getPath('tree.children');
    expectTypeOf(children).toEqualTypeOf<TreeNode[]>();

    const listData = store.getPath('list.data');
    expectTypeOf(listData).toEqualTypeOf<number>();

    const next = store.getPath('list.next');
    expectTypeOf(next).toEqualTypeOf<LinkedList | null>();
  });

  it('setPath accepts correct types for recursive paths', () => {
    const store = makeStore();

    store.setPath('tree.value', 'updated');
    store.setPath('tree.children', []);
    store.setPath('list.data', 42);
    store.setPath('list.next', null);
    store.setPath('list.next', { data: 3, next: null });

    // @ts-expect-error - number not assignable to string
    store.setPath('tree.value', 123);

    // @ts-expect-error - string not assignable to TreeNode[]
    store.setPath('tree.children', 'not an array');

    // @ts-expect-error - string not assignable to number
    store.setPath('list.data', 'not a number');
  });

  it('setPath accepts functional updaters for recursive paths', () => {
    const store = makeStore();

    store.setPath('tree.children', (prev) => {
      expectTypeOf(prev).toEqualTypeOf<TreeNode[]>();
      return [...prev, { value: 'new', children: [] }];
    });

    store.setPath('list.data', (prev) => {
      expectTypeOf(prev).toEqualTypeOf<number>();
      return prev + 1;
    });
  });

  it('resetPath accepts recursive paths', () => {
    const store = makeStore();

    store.resetPath('tree');
    store.resetPath('tree.value');
    store.resetPath('tree.children');
    store.resetPath('list');
    store.resetPath('list.next');
    store.resetPath('fs');
    store.resetPath('fs.files');
  });
});
