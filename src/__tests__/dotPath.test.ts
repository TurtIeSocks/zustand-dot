import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { dotPath } from '../index';

interface TestState {
  user: {
    name: string;
    age: number;
    profile: {
      bio: string;
      avatar: string | null;
    };
  };
  items: Array<{ id: number; title: string }>;
  config: { nested: { deep: string } };
  nullable?: string;
  count: number;
}

function createTestStore() {
  return createStore<TestState>()(
    dotPath(
      (): TestState => ({
        user: {
          name: 'Alice',
          age: 30,
          profile: { bio: 'Hello', avatar: null },
        },
        items: [
          { id: 1, title: 'First' },
          { id: 2, title: 'Second' },
        ],
        config: { nested: { deep: 'value' } },
        count: 0,
      })
    )
  );
}

describe('stores with action functions in state', () => {
  interface ActionState {
    count: number;
    user: { name: string; greet: () => string };
    increment: () => void;
  }

  function createActionStore() {
    return createStore<ActionState>()(
      dotPath((set) => ({
        count: 0,
        user: { name: 'Alice', greet: () => 'hi' },
        increment: () => set((prev) => ({ count: prev.count + 1 })),
      }))
    );
  }

  it('creates a store whose initial state contains functions', () => {
    expect(() => createActionStore()).not.toThrow();
  });

  it('resetPath restores a data field without disturbing actions', () => {
    const store = createActionStore();
    store.setPath('count', 41);
    store.getState().increment();
    expect(store.getPath('count')).toBe(42);
    store.resetPath('count');
    expect(store.getPath('count')).toBe(0);
    store.getState().increment();
    expect(store.getPath('count')).toBe(1);
  });

  it('resetPath on a subtree containing a function keeps the action callable', () => {
    const store = createActionStore();
    store.setPath('user.name', 'Bob');
    store.resetPath('user');
    expect(store.getPath('user.name')).toBe('Alice');
    expect(store.getState().user.greet()).toBe('hi');
  });

  it('supports circular references in initial state', () => {
    interface Node {
      name: string;
      self?: Node;
    }
    const node: Node = { name: 'root' };
    node.self = node;
    const store = createStore<{ node: Node }>()(dotPath(() => ({ node })));
    store.setPath('node.name', 'changed');
    store.resetPath('node.name');
    expect(store.getPath('node.name')).toBe('root');
  });
});

describe('resetPath for paths absent from initial state', () => {
  it('removes an object key that was not initially set', () => {
    const store = createTestStore();
    store.setPath('nullable', 'later');
    expect('nullable' in store.getState()).toBe(true);
    store.resetPath('nullable');
    expect('nullable' in store.getState()).toBe(false);
    expect(store.getPath('nullable')).toBeUndefined();
  });

  it('removes an array element that was not initially present', () => {
    const store = createTestStore();
    store.setPath('items.2' as 'items.0', { id: 3, title: 'Third' });
    expect(store.getState().items).toHaveLength(3);
    store.resetPath('items.2' as 'items.0');
    expect(store.getState().items).toHaveLength(2);
  });
});

describe('getPath', () => {
  it('gets a top-level value', () => {
    const store = createTestStore();
    expect(store.getPath('count')).toBe(0);
  });

  it('gets a nested value', () => {
    const store = createTestStore();
    expect(store.getPath('user.name')).toBe('Alice');
  });

  it('gets a deeply nested value', () => {
    const store = createTestStore();
    expect(store.getPath('config.nested.deep')).toBe('value');
  });

  it('gets an array element by index', () => {
    const store = createTestStore();
    expect(store.getPath('items.0.title')).toBe('First');
    expect(store.getPath('items.1.id')).toBe(2);
  });

  it('returns undefined for non-existent paths', () => {
    const store = createTestStore();
    expect(store.getPath('nullable')).toBeUndefined();
  });

  it('returns default value when path resolves to null', () => {
    const store = createTestStore();
    expect(store.getPath('user.profile.avatar', 'fallback')).toBe('fallback');
  });

  it('returns default value when path resolves to undefined', () => {
    const store = createTestStore();
    expect(store.getPath('nullable', 'default')).toBe('default');
  });

  it('returns the actual value when it exists and default is provided', () => {
    const store = createTestStore();
    expect(store.getPath('user.name', 'fallback')).toBe('Alice');
  });
});

describe('setPath', () => {
  it('sets a top-level value', () => {
    const store = createTestStore();
    store.setPath('count', 5);
    expect(store.getPath('count')).toBe(5);
  });

  it('sets a nested value', () => {
    const store = createTestStore();
    store.setPath('user.name', 'Bob');
    expect(store.getPath('user.name')).toBe('Bob');
  });

  it('sets a deeply nested value', () => {
    const store = createTestStore();
    store.setPath('config.nested.deep', 'updated');
    expect(store.getPath('config.nested.deep')).toBe('updated');
  });

  it('sets an array element', () => {
    const store = createTestStore();
    store.setPath('items.0.title', 'Updated First');
    expect(store.getPath('items.0.title')).toBe('Updated First');
    // Other elements are preserved
    expect(store.getPath('items.1.title')).toBe('Second');
  });

  it('accepts a functional updater', () => {
    const store = createTestStore();
    store.setPath('count', (prev) => prev + 1);
    expect(store.getPath('count')).toBe(1);
    store.setPath('count', (prev) => prev + 10);
    expect(store.getPath('count')).toBe(11);
  });

  it('performs structural sharing (unchanged siblings keep reference)', () => {
    const store = createTestStore();
    const itemsBefore = store.getPath('items');
    store.setPath('user.name', 'Bob');
    const itemsAfter = store.getPath('items');
    expect(itemsBefore).toBe(itemsAfter);
  });

  it('sets array using functional updater', () => {
    const store = createTestStore();
    store.setPath('items', (prev) => [...prev, { id: 3, title: 'Third' }]);
    const items = store.getPath('items') as TestState['items'];
    expect(items).toHaveLength(3);
    expect(items[2].title).toBe('Third');
  });
});

describe('resetPath', () => {
  it('resets a nested value to initial state', () => {
    const store = createTestStore();
    store.setPath('user.name', 'Bob');
    expect(store.getPath('user.name')).toBe('Bob');
    store.resetPath('user.name');
    expect(store.getPath('user.name')).toBe('Alice');
  });

  it('resets an entire subtree', () => {
    const store = createTestStore();
    store.setPath('user.name', 'Bob');
    store.setPath('user.age', 99);
    store.resetPath('user');
    expect(store.getPath('user.name')).toBe('Alice');
    expect(store.getPath('user.age')).toBe(30);
  });

  it('does not affect sibling paths', () => {
    const store = createTestStore();
    store.setPath('count', 100);
    store.setPath('user.name', 'Bob');
    store.resetPath('user');
    expect(store.getPath('count')).toBe(100);
  });

  it('clone isolation: mutating reset value does not corrupt future resets', () => {
    const store = createTestStore();
    store.resetPath('items');
    const items1 = store.getPath('items') as TestState['items'];
    // Mutate the items via setPath
    store.setPath('items.0.title', 'Mutated');
    // Reset again
    store.resetPath('items');
    const items2 = store.getPath('items') as TestState['items'];
    expect(items2[0].title).toBe('First');
    expect(items1).not.toBe(items2); // Different references
  });
});

describe('path parsing edge cases', () => {
  it('handles bracket notation for array indices at runtime', () => {
    const store = createTestStore();
    // Paths<T> only emits dot notation, so bracket syntax needs a cast —
    // this exercises the runtime bracket parser with a real bracket string.
    store.setPath('items[0].title' as unknown as 'items.0.title', 'Bracket');
    expect(store.getPath('items[0].title' as unknown as 'items.0.title')).toBe(
      'Bracket'
    );
    expect(store.getPath('items.0.title')).toBe('Bracket');
  });

  it('handles quoted keys containing dots at runtime', () => {
    interface QuotedState {
      config: Record<string, string>;
    }
    const store = createStore<QuotedState>()(
      dotPath((): QuotedState => ({ config: { 'remote.url': 'origin' } }))
    );
    expect(
      store.getPath('config["remote.url"]' as unknown as `config.${string}`)
    ).toBe('origin');
  });

  it('rejects __proto__ path segments', () => {
    const store = createTestStore();
    expect(() =>
      store.setPath(
        'user.__proto__' as unknown as 'user.name',
        'polluted' as never
      )
    ).toThrow(/__proto__/);
    expect(() =>
      store.getPath('user.__proto__.x' as unknown as 'user.name')
    ).toThrow(/__proto__/);
  });

  it('handles multiple levels of nesting', () => {
    const store = createTestStore();
    store.setPath('config.nested.deep', 'very deep');
    expect(store.getState().config.nested.deep).toBe('very deep');
  });
});

describe('middleware composition', () => {
  it('works as a standard zustand store', () => {
    const store = createTestStore();
    // Regular setState still works
    store.setState({ count: 42 });
    expect(store.getState().count).toBe(42);
    // dotPath methods still work alongside
    expect(store.getPath('count')).toBe(42);
  });

  it('getState reflects setPath changes', () => {
    const store = createTestStore();
    store.setPath('user.name', 'Charlie');
    expect(store.getState().user.name).toBe('Charlie');
  });

  it('subscribe fires on setPath changes', () => {
    const store = createTestStore();
    const states: TestState[] = [];
    store.subscribe((state) => states.push(state));
    store.setPath('count', 1);
    store.setPath('count', 2);
    expect(states).toHaveLength(2);
    expect(states[0].count).toBe(1);
    expect(states[1].count).toBe(2);
  });
});
