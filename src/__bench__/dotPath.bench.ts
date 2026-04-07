import { bench, describe } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { dotPath } from '../index';

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface ShallowState {
  count: number;
  name: string;
}

interface DeepState {
  user: {
    profile: {
      bio: string;
      settings: {
        theme: string;
        notifications: boolean;
      };
    };
    posts: Array<{ id: number; title: string }>;
  };
  count: number;
}

function createShallowStore() {
  return createStore<ShallowState>()(
    dotPath((): ShallowState => ({ count: 0, name: 'Alice' }))
  );
}

function createDeepStore() {
  return createStore<DeepState>()(
    dotPath(
      (): DeepState => ({
        user: {
          profile: {
            bio: 'Hello',
            settings: { theme: 'dark', notifications: true },
          },
          posts: [
            { id: 1, title: 'First' },
            { id: 2, title: 'Second' },
          ],
        },
        count: 0,
      })
    )
  );
}

function createVanillaShallowStore() {
  return createStore<ShallowState>()(() => ({ count: 0, name: 'Alice' }));
}

function createVanillaDeepStore() {
  return createStore<DeepState>()(() => ({
    user: {
      profile: {
        bio: 'Hello',
        settings: { theme: 'dark', notifications: true },
      },
      posts: [
        { id: 1, title: 'First' },
        { id: 2, title: 'Second' },
      ],
    },
    count: 0,
  }));
}

// ─── Read: Shallow (1 level) ─────────────────────────────────────────────────

describe('read — shallow (1 level deep)', () => {
  const dotStore = createShallowStore();
  const vanillaStore = createVanillaShallowStore();

  bench('vanilla: getState().name', () => {
    vanillaStore.getState().name;
  });

  bench('dotPath: getPath("name")', () => {
    dotStore.getPath('name');
  });
});

// ─── Read: Deep (4 levels) ───────────────────────────────────────────────────

describe('read — deep (4 levels)', () => {
  const dotStore = createDeepStore();
  const vanillaStore = createVanillaDeepStore();

  bench('vanilla: getState().user.profile.settings.theme', () => {
    vanillaStore.getState().user.profile.settings.theme;
  });

  bench('dotPath: getPath("user.profile.settings.theme")', () => {
    dotStore.getPath('user.profile.settings.theme');
  });
});

// ─── Read: Array element ─────────────────────────────────────────────────────

describe('read — array element', () => {
  const dotStore = createDeepStore();
  const vanillaStore = createVanillaDeepStore();

  bench('vanilla: getState().user.posts[1].title', () => {
    vanillaStore.getState().user.posts[1].title;
  });

  bench('dotPath: getPath("user.posts.1.title")', () => {
    dotStore.getPath('user.posts.1.title');
  });
});

// ─── Write: Shallow (1 level) ────────────────────────────────────────────────

describe('write — shallow (1 level deep)', () => {
  const dotStore = createShallowStore();
  const vanillaStore = createVanillaShallowStore();
  let i = 0;

  bench('vanilla: setState({ count })', () => {
    vanillaStore.setState({ count: i++ });
  });

  bench('dotPath: setPath("count", value)', () => {
    dotStore.setPath('count', i++);
  });
});

// ─── Write: Deep (4 levels) ──────────────────────────────────────────────────

describe('write — deep (4 levels)', () => {
  const dotStore = createDeepStore();
  const vanillaStore = createVanillaDeepStore();

  bench('vanilla: setState(s => nested spread)', () => {
    vanillaStore.setState((state) => ({
      ...state,
      user: {
        ...state.user,
        profile: {
          ...state.user.profile,
          settings: {
            ...state.user.profile.settings,
            theme: 'light',
          },
        },
      },
    }));
  });

  bench('dotPath: setPath("user.profile.settings.theme", value)', () => {
    dotStore.setPath('user.profile.settings.theme', 'light');
  });
});

// ─── Write: Functional updater ───────────────────────────────────────────────

describe('write — functional updater', () => {
  const dotStore = createShallowStore();
  const vanillaStore = createVanillaShallowStore();

  bench('vanilla: setState(s => ({ count: s.count + 1 }))', () => {
    vanillaStore.setState((s) => ({ count: s.count + 1 }));
  });

  bench('dotPath: setPath("count", prev => prev + 1)', () => {
    dotStore.setPath('count', (prev) => prev + 1);
  });
});

// ─── Write: Array element ────────────────────────────────────────────────────

describe('write — array element', () => {
  const dotStore = createDeepStore();
  const vanillaStore = createVanillaDeepStore();

  bench('vanilla: setState(s => spread to update posts[0].title)', () => {
    vanillaStore.setState((state) => ({
      ...state,
      user: {
        ...state.user,
        posts: state.user.posts.map((p, i) =>
          i === 0 ? { ...p, title: 'Updated' } : p
        ),
      },
    }));
  });

  bench('dotPath: setPath("user.posts.0.title", value)', () => {
    dotStore.setPath('user.posts.0.title', 'Updated');
  });
});

// ─── Reset vs manual ─────────────────────────────────────────────────────────

describe('reset — subtree', () => {
  const dotStore = createDeepStore();
  const vanillaStore = createVanillaDeepStore();
  const initialProfile = {
    bio: 'Hello',
    settings: { theme: 'dark', notifications: true },
  };

  bench('vanilla: setState with hardcoded initial value', () => {
    vanillaStore.setState((state) => ({
      ...state,
      user: {
        ...state.user,
        profile: structuredClone(initialProfile),
      },
    }));
  });

  bench('dotPath: resetPath("user.profile")', () => {
    dotStore.resetPath('user.profile');
  });
});
