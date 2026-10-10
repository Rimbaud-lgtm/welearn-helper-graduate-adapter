# Product Acceptance

Version: 0.3.9-preview.3. Status: PREVIEW / SUPPORTED LIVE BATCHES VERIFIED / NOT STABLE.

The runtime is an Edge Manifest V3 extension with local authorization, exact readback, native submission, official results and directory reconciliation. It requires no Codex, shell, local server or external answer backend.

| Capability | Evidence and boundary |
|---|---|
| Sideload and permanent side panel | Live preview.2 installation and side panel observed |
| Scoped consent and cumulative quota | Live bounded runs; automatic ten-item batch continuation observed; no scope expansion |
| Input, native submit, result, directory | Supported cases verified in real Edge; timestamp-only results kept separate |
| Existing-completion and submit replay protection | Persisted receipts and targeted safety tests; no score reset action |
| Loaded empty pages | Confirmed loaded/no-input content waits10seconds before native return |
| Unsupported or unreliable items | Pending list, including recording, readonly, ambiguity and draft conflict |
| Stale navigation filtering / recording resume | Targeted regressions and subsequent live continuation in preview.2 |
| Duplicate-ID preflight / top reconnect | preview.3 targeted tests PASS; separate live installation UNVERIFIED |
| Late navigation / terminal session labels | Known limitation: timeout or later events may showSESSION_ENDED despite normal catalog; not fully resolved |
| Cold browser restart without Codex | UNVERIFIED |
| Real offline or crash recovery | UNVERIFIED; uncertain submission must never be replayed |
| Full-course type coverage | NOT SUPPORTED |

Public historical runtime snapshots are published only with explicit owner permission in [runtime-logs](runtime-logs/README.md). Local screenshots and unrelated workspace records remain outside this repository. Synthetic tests and launch acknowledgements never count as native system grades.
