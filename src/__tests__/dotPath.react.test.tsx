import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { dotPath } from '../index';

interface TestState {
  user: {
    name: string;
    age: number;
  };
  items: Array<{ id: number; title: string }>;
  count: number;
}

function createTestStore() {
  return create<TestState>()(
    dotPath(() => ({
      user: { name: 'Alice', age: 30 },
      items: [{ id: 1, title: 'First' }],
      count: 0,
    }))
  );
}

describe('usePath hook', () => {
  it('returns the current value at a path', () => {
    const useStore = createTestStore();
    const { result } = renderHook(() => useStore.usePath('user.name'));
    expect(result.current[0]).toBe('Alice');
  });

  it('returns a setter function', () => {
    const useStore = createTestStore();
    const { result } = renderHook(() => useStore.usePath('user.name'));
    expect(typeof result.current[1]).toBe('function');
  });

  it('setter updates the value and triggers re-render', () => {
    const useStore = createTestStore();
    const { result } = renderHook(() => useStore.usePath('user.name'));

    act(() => {
      result.current[1]('Bob');
    });

    expect(result.current[0]).toBe('Bob');
  });

  it('setter works with functional updater', () => {
    const useStore = createTestStore();
    const { result } = renderHook(() => useStore.usePath('count'));

    act(() => {
      result.current[1]((prev: number) => prev + 1);
    });

    expect(result.current[0]).toBe(1);
  });

  it('returns default value when path is undefined', () => {
    const useStore = create<{ val?: string }>()(dotPath(() => ({})));
    const { result } = renderHook(() => useStore.usePath('val', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('returns default value when path is null', () => {
    const useStore = create<{ val: string | null }>()(
      dotPath((): { val: string | null } => ({ val: null }))
    );
    const { result } = renderHook(() => useStore.usePath('val', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('does not re-render when an unrelated sibling path changes', () => {
    const useStore = createTestStore();
    let renderCount = 0;

    const { result } = renderHook(() => {
      renderCount++;
      return useStore.usePath('user.name');
    });

    expect(renderCount).toBe(1);

    act(() => {
      useStore.setPath('count', 41);
      useStore.setPath('items.0.title', 'Changed');
      useStore.setState({ count: 42 });
    });

    expect(renderCount).toBe(1);
    expect(result.current[0]).toBe('Alice');
  });

  it('provides stable setter reference across renders', () => {
    const useStore = createTestStore();
    const { result, rerender } = renderHook(() =>
      useStore.usePath('user.name')
    );

    const setter1 = result.current[1];
    rerender();
    const setter2 = result.current[1];

    expect(setter1).toBe(setter2);
  });

  it('default value memoization prevents extra renders with object defaults', () => {
    const useStore = createTestStore();
    let renderCount = 0;

    const { rerender } = renderHook(() => {
      renderCount++;
      // Passing a new [] reference each render — should be memoized internally
      return useStore.usePath('items', []);
    });

    expect(renderCount).toBe(1);
    rerender();
    expect(renderCount).toBe(2); // Normal re-render, not infinite loop
    rerender();
    expect(renderCount).toBe(3); // Still stable, no exponential growth
  });

  it('reflects external setPath changes', () => {
    const useStore = createTestStore();
    const { result } = renderHook(() => useStore.usePath('count'));

    act(() => {
      useStore.setPath('count', 42);
    });

    expect(result.current[0]).toBe(42);
  });

  it('reflects external setState changes', () => {
    const useStore = createTestStore();
    const { result } = renderHook(() => useStore.usePath('count'));

    act(() => {
      useStore.setState({ count: 99 });
    });

    expect(result.current[0]).toBe(99);
  });
});
