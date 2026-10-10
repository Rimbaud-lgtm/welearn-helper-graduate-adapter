# Historical Compatibility Summary

This is the initial assessment, not the current release status. See [current acceptance](PRODUCT_PLAN.md) and [release notes](RELEASE_NOTES.md).

Assessment date: 2026-10-09. Target: 《新时代研究生学术英语：综合教程1》, official course catalog `cid=2850`.

## Findings

- The existing authorized Edge session showed `B1U1 Higher Education > Reading Text One > Understanding the Text > Ex. 2` with enabled browser answer choices. This supports browser answer controls for Ex. 2 only; it does not establish support for every exercise or system scoring.
- The target iframe markup includes `textarea[data-itemtype]` answer fields and no `input[data-itemtype]` controls.
- Upstream WELearnHelper v1.1.0 lacks this course in its route table/catalog. Its blank solver targets `input[data-itemtype]`, so the unmodified release is not compatible with the observed target.
- The adapter was validated against a synthetic fixture only. Live extension installation, page injection, real-page field readback, and system correctness remain unverified.

## Safety Boundary

No credentials, cookies, class-specific identifiers, answers, or personal course progress are included here. No live exercise was submitted, reset, or modified by the adapter test.
