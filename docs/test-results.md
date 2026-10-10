# Synthetic Adapter Test Results

Historical adapter-only command (before the extension test suite was added). Current npm test runs additional suites; see [release verification](RELEASE_NOTES.md).

Observed result on 2026-10-09:

```text
PASS rounds=20 mapped_items=10 textarea_writes=120 dynamic_rerender=1 submit_clicks=0
FIXTURE_MS mean=7.94 p50=5.26 p95=8.16
```

The latency is synthetic fixture processing time, not real browser end-to-end fill time. The test verifies parser ordering, choice/blank classification, textarea value and bubbled events, re-query after a simulated rerender, and that the test does not click submit. It does not assess answer correctness, live-page compatibility, or WeLearn's score.
