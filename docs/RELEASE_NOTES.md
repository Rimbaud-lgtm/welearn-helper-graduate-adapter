# 0.3.8-preview.1

This is a prerelease for course 2850, not a verified unattended all-course release.

## Included

- Installable Manifest V3 Edge extension and local settings.
- Native directory scanning, completion deduplication and authorized queues.
- Choice, text and reference input with exact readback before native submission.
- Scoped consent, account binding, quotas and persisted one-use submission receipts.
- Native grading and directory reconciliation; saved-time-only results remain ungraded.
- Pause, resume, stop, pending reasons and local audit export.
- Loaded content-only pages wait ten seconds before normal navigation.
- Long text retains uniqueness checks; the identified introduction task can use its explicit course sample without explanatory notes.
- UI launch waits for background acknowledgement before closing its popup.

## Verification Boundaries

Real Edge workflows have verified supported input, normal submission, results and consecutive navigation. Development tooling was used for configuration, upgrades and diagnosis, not for entering answers or clicking native Submit in those extension acceptance runs.

Cold restart with Codex closed, real offline/crash recovery, recording tasks and complete coverage of all units are still unverified. Existing grades must not be reset or resubmitted. A transport acknowledgement or successful input is not a completed exercise.

## Install and Upgrade

Use the preview ZIP and follow [INSTALL.md](INSTALL.md). Preserve the installation folder and reload the existing extension instead of uninstalling it, so local settings and receipts remain available.

The repository and package contain no cookies, credentials, personal execution records, screenshots or copied course answers. No progress/grade API spoofing is used.
