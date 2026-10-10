# WELearnHelper Graduate Academic Adapter

An installable Edge extension for course 2850, based on adapter work derived from `SSmJaE/WELearnHelper` v1.1.0 (`3dddb2af63e8004bf60416df3a62b72095206f5d`). Current version: **0.3.8-preview.1**.

## Scope

- Reads the native course directory and skips existing completion records.
- Fills supported choice/text controls and verifies exact input readback.
- Submits only within explicitly saved exercise scope and quota, through native page controls.
- Reads native grades or saved-time-only results and reconciles the directory before continuing.
- Saves settings, task state, submission receipts and pending reasons locally; supports pause/resume/stop.
- Holds unsupported recording tasks and ambiguous candidates without submitting them.

## Install and Use

Download the preview ZIP from this repository's Releases, extract it to a permanent location, and load the folder containing `manifest.json` through Edge's developer-mode extension page. See [installation and upgrades](docs/INSTALL.md).

After configuration and explicit submission authorization, runtime use requires Edge only: no Codex, PowerShell, Python, Node.js, local server or native host. Development scripts are not part of the runtime.

## Verification Status

Supported practice workflows have real Edge evidence for extension-driven input, native submission, system results and directory reconciliation. This does **not** establish coverage of every course item or guarantee answer accuracy. A completed item with only a saved timestamp is not reported as a percentage grade.

Closing Codex, restarting Edge, and running with one click has **not yet passed independent acceptance**. Real offline/crash recovery and full-course coverage are also unverified. This is a preview, not a stable unattended all-course product. See [product acceptance](docs/PRODUCT_PLAN.md) and [preview notes](docs/RELEASE_NOTES.md).

No credentials, cookies, personal progress records, screenshots or course answer dumps are included. Runtime reference extraction uses authorized course content; it does not change grades or progress through private APIs.

## Test

Requires Node.js 20 or newer.

```powershell
npm install
npm test
npm run build
```

The build output is `dist/edge`. Tests cover parsing, state, authorization, submission replay protection, directory reconciliation, foreground handling and launch acknowledgement. Tests do not substitute for native system grading.

## Upstream and License

The adapter is derived from [WELearnHelper](https://github.com/SSmJaE/WELearnHelper), upstream v1.1.0. This repository is distributed under GPL-3.0; see [LICENSE](LICENSE).
