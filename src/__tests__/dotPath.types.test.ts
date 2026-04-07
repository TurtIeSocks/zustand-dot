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
