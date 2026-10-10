# Product Goal and Acceptance

Version: 0.3.8-preview.1. Status: SUPPORTED HOT WORKFLOWS VERIFIED / NOT STABLE. Canonical private operational records remain in the parent workspace and are not uploaded.

The final deliverable is an Edge extension installed once, with local settings, a one-click practice action, supported-type discovery, exact readback, bounded submission authorization, system results and restart recovery. Runtime use must require no developer tooling.

Version 0.3.8-preview.1 provides native directory queues, scoped submission, readback, system-result reconciliation and acknowledged popup launches. Runtime requires only Edge extension APIs, not a native host, server, shell or Codex. Real extension-driven supported workflows have been verified, including a user-started writing flow. Early Agent PowerShell/UIA completions are not counted as extension acceptance. No third-party backend, user credentials or personal progress artifacts are packaged.

| Milestone | Acceptance | Current status |
|---|---|---|
| Installable package | Manifest V3 bundle, version, ZIP and install/upgrade instructions | PASS, preview |
| Local settings/recovery | Settings and state retained; uncertain submissions never retried | Implemented; real crash/offline recovery UNVERIFIED |
| Real Edge installation | Native sideload succeeds, popup usable | PASS |
| Actual input/type tests | Candidate filled and character readback verified on actual course | PASS for verified choice/text/reference cases, not all types |
| One-time submission scope | Exact exercise list, identity binding, quota, revocation | Explicit scope/quota used in live runs; safety tests PASS |
| Real scoring | Current native score plus directory completion/score and exact counter delta; timestamp-only tasks separate | PASS for tested scored and timestamp-only cases |
| Batch navigation | Native directory controls, known incomplete authorized items, persisted nonce; no reset/re-submit | PASS for supported consecutive runs; no full-course claim |
| Browser close/reopen | Second use works with saved settings and no developer commands | UNVERIFIED |
| Stable release | All required live checks passed | NOT READY |

Unsupported types, ambiguous candidates and draft conflicts are retained as pending and skipped under the saved skip policy. Unknown completion state, field mismatch, unexpected page change, offline/session failure, uncertain submission, missing identity or expired scope pause execution. Scope is never silently expanded. No reset action exists in the extension.
