import { describe, expectTypeOf, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { type DotPath, dotPath, type PathValue } from '../index';

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
    expectTypeOf<'user'>().toMatchTypeOf<DotPath<TestState>>();
    expectTypeOf<'items'>().toMatchTypeOf<DotPath<TestState>>();
    expectTypeOf<'count'>().toMatchTypeOf<DotPath<TestState>>();
  });

  it('generates nested paths', () => {
    expectTypeOf<'user.name'>().toMatchTypeOf<DotPath<TestState>>();
    expectTypeOf<'user.age'>().toMatchTypeOf<DotPath<TestState>>();
    expectTypeOf<'user.tags'>().toMatchTypeOf<DotPath<TestState>>();
  });

  it('generates array element paths', () => {
    expectTypeOf<`items.${number}`>().toMatchTypeOf<DotPath<TestState>>();
    expectTypeOf<`items.${number}.id`>().toMatchTypeOf<DotPath<TestState>>();
    expectTypeOf<`items.${number}.title`>().toMatchTypeOf<DotPath<TestState>>();
  });

  it('includes optional properties', () => {
    expectTypeOf<'optional'>().toMatchTypeOf<DotPath<TestState>>();
  });
});

describe('PathValue type', () => {
  it('resolves top-level types', () => {
    expectTypeOf<PathValue<TestState, 'count'>>().toEqualTypeOf<number>();
    expectTypeOf<PathValue<TestState, 'user'>>().toEqualTypeOf<
      TestState['user']
    >();
  });

  it('resolves nested types', () => {
    expectTypeOf<PathValue<TestState, 'user.name'>>().toEqualTypeOf<string>();
    expectTypeOf<PathValue<TestState, 'user.age'>>().toEqualTypeOf<number>();
  });

  it('resolves array element types', () => {
    expectTypeOf<PathValue<TestState, 'items'>>().toEqualTypeOf<
      TestState['items']
    >();
  });

  it('resolves optional property types', () => {
    expectTypeOf<PathValue<TestState, 'optional'>>().toEqualTypeOf<
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
