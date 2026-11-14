import { vi } from 'vitest';

interface DevtoolsWindow {
  __REDUX_DEVTOOLS_EXTENSION__?: unknown;
}

/**
 * Installs a fake Redux DevTools extension on `window` so zustand's
 * `devtools` middleware connects and records actions. Call `restore` in
 * `afterEach`.
 */
export function mockDevtools() {
  const send = vi.fn();
  const connection = {
    init: vi.fn(),
    send,
    subscribe: vi.fn(() => () => {}),
    unsubscribe: vi.fn(),
    error: vi.fn(),
  };
  const win = window as DevtoolsWindow;
  win.__REDUX_DEVTOOLS_EXTENSION__ = { connect: vi.fn(() => connection) };

  return {
    /** Action types sent to the extension, in order. */
    sentTypes: () => send.mock.calls.map(([action]) => action.type as string),
    restore: () => {
      delete win.__REDUX_DEVTOOLS_EXTENSION__;
    },
  };
}
