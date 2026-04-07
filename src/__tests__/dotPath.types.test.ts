import { describe, expectTypeOf, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { dotPath, type Get, type Paths } from '../index';

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
    expectTypeOf<'user'>().toMatchTypeOf<Paths<TestState>>();
    expectTypeOf<'items'>().toMatchTypeOf<Paths<TestState>>();
    expectTypeOf<'count'>().toMatchTypeOf<Paths<TestState>>();
  });

  it('generates nested paths', () => {
    expectTypeOf<'user.name'>().toMatchTypeOf<Paths<TestState>>();
    expectTypeOf<'user.age'>().toMatchTypeOf<Paths<TestState>>();
    expectTypeOf<'user.tags'>().toMatchTypeOf<Paths<TestState>>();
  });

  it('generates array element paths', () => {
    expectTypeOf<`items.${number}`>().toMatchTypeOf<Paths<TestState>>();
    expectTypeOf<`items.${number}.id`>().toMatchTypeOf<Paths<TestState>>();
    expectTypeOf<`items.${number}.title`>().toMatchTypeOf<Paths<TestState>>();
  });

  it('includes optional properties', () => {
    expectTypeOf<'optional'>().toMatchTypeOf<Paths<TestState>>();
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
    expectTypeOf<'tree'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<'tree.value'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<'tree.children'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<`tree.children.${number}`>().toMatchTypeOf<
      Paths<RecursiveState>
    >();
    expectTypeOf<`tree.children.${number}.value`>().toMatchTypeOf<
      Paths<RecursiveState>
    >();
    expectTypeOf<`tree.children.${number}.children`>().toMatchTypeOf<
      Paths<RecursiveState>
    >();
  });

  it('generates paths for nullable linked list', () => {
    expectTypeOf<'list'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<'list.data'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<'list.next'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<'list.next.data'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<'list.next.next'>().toMatchTypeOf<Paths<RecursiveState>>();
  });

  it('generates paths for JSON-like recursive unions', () => {
    expectTypeOf<'json'>().toMatchTypeOf<Paths<RecursiveState>>();
  });

  it('generates paths for mutually recursive types', () => {
    expectTypeOf<'fs'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<'fs.name'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<'fs.files'>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<`fs.files.${number}`>().toMatchTypeOf<Paths<RecursiveState>>();
    expectTypeOf<`fs.files.${number}.name`>().toMatchTypeOf<
      Paths<RecursiveState>
    >();
    expectTypeOf<`fs.files.${number}.parent`>().toMatchTypeOf<
      Paths<RecursiveState>
    >();
    expectTypeOf<`fs.files.${number}.parent.name`>().toMatchTypeOf<
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
