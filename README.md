# WELearnHelper Graduate Academic Adapter

Minimal course-route and textarea adapter work based on `SSmJaE/WELearnHelper` v1.1.0 (`3dddb2af63e8004bf60416df3a62b72095206f5d`).

## Scope

- Adds the course route `New Era Academic English Graduate Students 1`.
- Parses existing `[data-solution]` nodes and supports blank answers in `textarea[data-itemtype]`.
- Includes a synthetic DOM regression test. It does not automate answer selection or submission in the live service.

This repository contains selected adapter files, not a complete browser extension. The extension has **not** been installed or injected into a live course session. The synthetic test does not establish answer correctness or system scoring.

## Test

Requires Node.js 20 or newer.

```powershell
npm install
npm test
```

## Upstream and License

The adapter is derived from [WELearnHelper](https://github.com/SSmJaE/WELearnHelper), upstream v1.1.0. This repository is distributed under GPL-3.0; see [LICENSE](LICENSE).
