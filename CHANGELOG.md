# [1.4.0](https://github.com/TurtIeSocks/zustand-dot/compare/v1.3.0...v1.4.0) (2026-11-14)


### Bug Fixes

* route path writes through api.setState so middleware order no longer matters ([1b719a0](https://github.com/TurtIeSocks/zustand-dot/commit/1b719a0e825086698bdbbc8ce05856184103e936))


### Features

* add jsdocs to public APIs ([f06ef02](https://github.com/TurtIeSocks/zustand-dot/commit/f06ef02ff46b0e7ed14b9243356cb0b9e67f8a60))
* name path writes in Redux DevTools ([717dd81](https://github.com/TurtIeSocks/zustand-dot/commit/717dd818d3e63a5c5770740f5c214a13aa4664a3))

# [1.3.0](https://github.com/TurtIeSocks/zustand-dot/compare/v1.2.1...v1.3.0) (2026-11-13)


### Bug Fixes

* **deps:** bump dot.paths to ^0.2.3 ([81b3382](https://github.com/TurtIeSocks/zustand-dot/commit/81b33821ef5092cffd2c7ef03b4867edb1d84677)), closes [chelonejs/dot.paths#11](https://github.com/chelonejs/dot.paths/issues/11)


### Features

* re-export every dot.paths type, adding GetOptions ([4d8ec79](https://github.com/TurtIeSocks/zustand-dot/commit/4d8ec796e52e29c73b0c585b8c396efadc2d7d4c))

## [1.2.1](https://github.com/TurtIeSocks/zustand-dot/compare/v1.2.0...v1.2.1) (2026-09-03)


### Bug Fixes

* **deps:** bump dot.paths to ^0.1.2 ([b311447](https://github.com/TurtIeSocks/zustand-dot/commit/b3114470ce1b4c6852475d64342d886580fc2f4d))

# [1.2.0](https://github.com/TurtIeSocks/zustand-dot/compare/v1.1.0...v1.2.0) (2026-08-24)


### Bug Fixes

* **ci:** publish via npm trusted publishing (OIDC) ([448fafe](https://github.com/TurtIeSocks/zustand-dot/commit/448fafe5f24c61688d1f009511a281637749b112))
* **deps:** move dot.paths to runtime dependencies at ^0.1.1 ([00889bf](https://github.com/TurtIeSocks/zustand-dot/commit/00889bfe5df2e0554664656fa4ab5c91ff0bbe2b))
* harden path parsing, reset semantics, and snapshot cycles ([01c3db0](https://github.com/TurtIeSocks/zustand-dot/commit/01c3db0f4f30b3029dded8931d3670e7139783ea))
* loosen react peer dependency to >=18 ([fb37a22](https://github.com/TurtIeSocks/zustand-dot/commit/fb37a22f2387465553d28946e67d555d912ba606))
* **pkg:** resolve ESM imports to index.d.mts types ([f81d4ff](https://github.com/TurtIeSocks/zustand-dot/commit/f81d4ffd5c5bc422073f4faa4531224a1c03c0bb))
* **release:** wire changelog and git plugins into semantic-release ([6a95c2e](https://github.com/TurtIeSocks/zustand-dot/commit/6a95c2ed9027ecd53a886681c6368c47102c8c61))
* support action functions in state when snapshotting for resetPath ([0ccba2a](https://github.com/TurtIeSocks/zustand-dot/commit/0ccba2a81cce24137e5849fffb93142ad0cf9b5a))


### Features

* add subscribePath for vanilla path subscriptions ([d2c2f7d](https://github.com/TurtIeSocks/zustand-dot/commit/d2c2f7da0548f4413ab561774b2eaf6716a135ba))
* align type exports with dot.paths and make path depth configurable ([96d2965](https://github.com/TurtIeSocks/zustand-dot/commit/96d2965dab74f17de0ffbe04eb4ff831869561b5))
