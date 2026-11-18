# macOS Release Signing Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the tasks in order. Track verified results in the maintenance record.

**Goal:** PR checks retain ad-hoc packaging; the separate manual release build always signs and notarizes Mac artifacts before upload.

**Architecture:** Keep `ci.yml` unchanged. Make `build.yml` a trusted, manual release entry on master, with a dedicated macOS job using environment secrets. An explicit release mode in `pack.mjs` fails on missing signing prerequisites, notarizes/staples the DMG, and rebuilds its blockmap before electron-builder emits update metadata.

**Tech Stack:** Electron-builder 26, Node test runner, GitHub Actions, Developer ID and notarytool.

**Spec:** User request of 2026-11-18: automate signing/notarization for future Mac release packages, while ordinary PRs keep the previous unsigned/unnotarized pipeline. Existing PR ad-hoc signing remains necessary for bundle integrity.

## Global Constraints

- Preserve the four required PR check names and their secret-free behavior.
- Only the macOS release job accesses the `macos-release` environment; restrict it to master.
- No credentials in repository, logs, artifacts or command output.
- Fail rather than silently fall back to unsigned/unnotarized release artifacts.
- No public GitHub Release is created by this configuration task.

## Review Focus

- Missing certificate/profile, incompatible flags or wrong platform must fail before packaging.
- Rejected/timed-out notarization must stop artifact delivery.
- Stapling changes bytes: DMG hash, size and blockmap must match final bytes.
- Copied DMG payload must retain Developer ID, ticket and Gatekeeper acceptance.
- PR jobs cannot request signing credentials or trigger the long release job.

## Tasks

- [x] Add failing behavior tests for explicit release configuration and finalization failure/success, using real temporary files/blockmaps and a controlled Apple-command boundary.
- [x] Implement release preflight and artifact finalizer; add strict installed-app verification to the existing macOS install check.
- [x] Split manual release build jobs, add protected environment credentials and sufficient timeouts, and make validation block uploads.
- [x] Run focused/full tests and workflow validation; independently review the final diff.
- [x] Configure encrypted environment secrets, deliver through normal PR checks, then run the master release workflow and validate its downloaded artifacts.
- [x] Update maintenance state, evidence, development reference and bilingual release-build instructions.

## Decisions

- Reuse the existing manual `build.yml` rather than adding another overlapping release pipeline; retain workflow filename for existing callers.
- Keep publishing a GitHub Release separate from building verified artifacts.
- Native implementation in this checkout; a fresh reviewer checks the completed change.

## Execution ledger

- 2026-11-18: 15 focused tests green after observed pre-implementation failures. Full test: 1223 application pass / 2 skip, Licia both 606 pass / 4 pending. Lint/i18n and actionlint pass.
- macos-release environment restricted to master; 5 secrets configured, password provided directly by user through GitHub UI.
- Ruling: delivering the requested working CI includes normal branch/PR and gated merge followed by an actual release build; no public release. Existing user authorization covers that configuration work.

- Rebased onto master 2294be9, preserving unsigned WDA and both iOS toolchains; PR CI remains unchanged against that base. Rebased tests: 1260 pass / 2 skip, Licia both 606 / 4 pending, lint/actionlint pass.
- Fresh review found Windows unpacked payload upload regression; restored exclusion and narrowed uploads to release version directory top-level files. Finding rechecked as resolved.

- PR #100 merged after all required checks. Master a9648e7 Release Build 44268063532 passed all jobs; app/DMG signing and notarization took 9m7s. Downloaded artifact passed independent local app/DMG trust and final metadata/blockmap checks; evidence archived in docs/maintenance/evidence/macos-release-ci-20261118.json.
- Final artifact inspection found builder-debug.yml in the YAML glob; explicitly exclude it on both platforms. actionlint and filtering against actual downloaded filenames pass. No signing/packaging logic changed after the successful release run.
