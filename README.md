# Zustand Dot Path Middleware

A typesafe, reactive middleware for [Zustand](https://github.com/pmndrs/zustand) that enables deep property access using dot notation. Support your complex state objects with granular subscriptions, immutable updates, and stable default values.

## Features

- 🎯 **Deep Access**: Get, set, and subscribe to deeply nested values using dot path strings (e.g., `user.posts.0.title`).
- 🛡️ **Fully Typesafe**: Paths and return values are strictly inferred. Invalid paths throw compile-time errors.
- ⚡ **Reactive Hook**: `usePath` subscribes _only_ to the specific path you request.
- 🧘 **Stable Defaults**: `usePath` memoizes default values deeply, preventing unnecessary re-renders when passing objects/arrays as defaults.
- 🔄 **Immutable Updates**: `setPath` performs structural sharing, updating only what changed.
- 🔢 **Array Support**: seamless array access via dot notation (`items.0`) or brackets (`items[0]`).

## Installation

```bash
npm install zustand-dot zustand
# or
yarn add zustand-dot zustand
# or
pnpm add zustand-dot zustand
# or
bun add zustand-dot zustand
```

## Setup

Wrap your store creator with `dotPath`.

```typescript
import { create } from 'zustand'
import { dotPath } from 'zustand-dot'

interface State {
  user: {
    profile: {
      name: string
      age: number
    }
    posts: Array<{ id: number; title: string }>
  }
}

const useStore = create<State>()(
  dotPath((set) => ({
    user: {
      profile: { name: 'Alice', age: 30 },
      posts: [],
    },
  }))
)
```

## API

### `usePath(path, defaultValue?)`

A React hook that subscribes to a specific path in the store.

```typescript
// Component re-renders ONLY when user.profile.name changes
const [name, setName] = useStore.usePath('user.profile.name')

// With a default value (memoized deeply!)
const [posts, setPosts] = useStore.usePath('user.posts', [])
// ^ Safe! Passing [] as default won't cause infinite re-renders.
```

- **Arguments**:
  - `path`: string - Dot notation path to the value.
  - `defaultValue`: (optional) - Value to return if the path resolves to `null` or `undefined`.
- **Returns**: `[value, setter]` tuple.

Object and array defaults are compared deeply on every render, so hoist large defaults to a module constant.

### `setPath(path, valueOrUpdater)`

Updates a value deeply, creating nested objects/arrays if they don't exist.

```typescript
// Set a value directly
useStore.setPath('user.profile.age', 31)

// Functional update (receives current raw value at path)
useStore.setPath('user.posts', (posts) => [...posts, { id: 1, title: 'New' }])

// Arrays via index
useStore.setPath('user.posts.0.title', 'Updated Title')
```

- **Arguments**:
  - `path`: string.
  - `valueOrUpdater`: The new value, or a function `(prev) => next`.

### `getPath(path, defaultValue?)`

Imperatively get a value from the store (non-reactive).

```typescript
const age = useStore.getPath('user.profile.age')
```

### `resetPath(path)`

Resets a specific path (subtree) back to its _initial state_ captured at store creation time.

```typescript
// Reverts user.profile to { name: 'Alice', age: 30 }
useStore.resetPath('user.profile')
```

Action functions stored in state are snapshotted by reference, so resetting a subtree that contains actions keeps them callable. Resetting a path that was absent from the initial state removes the key instead of leaving `undefined` behind.

## TypeScript Support

The middleware leverages advanced recursive types to provide autocomplete and validation.

```typescript
// ✅ Valid
useStore.setPath('user.profile.name', 'Bob')

// ❌ Error: Property 'nominative' does not exist
useStore.setPath('user.profile.nominative', 'Bob')

// ❌ Error: Type 'number' is not assignable to type 'string'
useStore.setPath('user.profile.name', 123)
```

### Path Syntax

- Dot notation: `a.b.c`
- Array indices: `items.0.id`

The runtime parser also accepts brackets (`items[0].id`) and quoted keys (`config["remote.url"]`), but `Paths<T>` only generates dot notation, so the typed API rejects those forms. Use them with a cast when a key contains a literal dot.

Path enumeration comes from [`dot.paths`](https://github.com/TurtIeSocks/dot.paths) and stops at 8 levels by default. Deeper values stay reachable at runtime.

## Performance

All dot-path operations use cached path parsing, iterative deep-set, and closure-free state updates. Benchmarked against equivalent vanilla Zustand patterns using `vitest bench`.

| Operation                  | vs Vanilla       | Absolute (per op) |
| -------------------------- | ---------------- | ----------------- |
| Read — shallow             | 1.09x slower     | ~22 ns            |
| Read — deep (4 levels)     | 1.92x slower     | ~38 ns            |
| Read — array element       | 1.75x slower     | ~36 ns            |
| Write — shallow            | **1.13x faster** | ~36 ns            |
| Write — deep (4 levels)    | 2.56x slower     | ~161 ns           |
| Write — functional updater | 1.41x slower     | ~62 ns            |
| Write — array element      | 2.15x slower     | ~142 ns           |
| Reset — subtree            | **4.67x faster** | ~197 ns           |

Shallow reads are within 10% of direct property access. Shallow writes are _faster_ than vanilla `setState` because `setPath` uses `replace: true`, skipping Zustand's partial state merge. Resets beat the vanilla pattern because the initial subtree is snapshotted once at store creation and restored from cached path segments.

Run `npm run bench` to reproduce.

## License

MIT
