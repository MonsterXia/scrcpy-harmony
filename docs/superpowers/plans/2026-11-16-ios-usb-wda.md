# iOS USB WDA Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; execute in this chat and obtain a fresh final code review.

**Goal:** Add UDID-bound USB screenshot/control and opt-in ReplayKit H.264 mirroring.
**Architecture:** Direct usbmux sockets → bounded WDA HTTP client → iOS backend → existing native window and automation queue. PNG preview precedes video; AirPlay remains separate.
**Tech Stack:** TypeScript, Electron, Node HTTP/net, React, XCTest/ReplayKit/VideoToolbox.
**Spec:** ../specs/2026-11-16-ios-usb-wda-design.md

## Global Constraints

No closed-source bridge or runtime iproxy. Pin WDA source SHA. Preserve Android/Harmony and AirPlay. Bilingual text. User requests code/automated validation first; no claim of physical-device acceptance.

## Review Focus

Wrong UDID, cancellation during connection/start, rotation between frame and input, remote side effects after timeout, and video cleanup affecting another client. Tests below cover these boundaries.

### Task 1: USB transport and WDA screenshot/control

- [x] Add failing loopback tests for UDID/port selection, coalesced bytes, cancellation, bounded HTTP/PNG, malformed responses and action coordinates.
- [x] Export connectIos(udid, port, signal) from ios-usbmux.ts; add ios-wda.ts transport/client and ios.ts screenshot/input lifecycle.
- [x] Verify with node --test test/plus-ios*.test.cjs test/plus-usbmux.test.cjs.

### Task 2: Native window, UI and automation

- [x] Add failing tests for distinct USB/AirPlay identity, PNG display, USB input, capability routing and screenshot-first behavior.
- [x] Extend NativeFrame/FrameGate for PNG; add iOS backend, explicit video toggle and localized WDA readiness messages; preserve per-frame metadata for input.
- [x] Include USB iOS in device selection; wire automation via complete iOS actions under existing queue, leave AirPlay unsupported.
- [x] Run affected renderer/window/automation tests and lint/i18n.

### Task 3: ReplayKit video

- [x] Add fragmented/coalesced scrcpy packet tests and owned-session startup/close/cancel/failure tests.
- [x] Add ios-video.ts parser and backend start/stop video, H.264 config/keyframe handling and screenshot fallback.
- [x] Verify no stop-all calls and no automatic write retries.

### Task 4: Reproducible preparation and acceptance

- [x] Add pinned WDA source manifest and prepare/build/run script with explicit UDID/team, plus help/argument validation tests.
- [x] Attempt unsigned WDA build in available Xcode; record limits separately.
- [x] Run full tests, lint, application builds and compare TypeScript diagnostics to baseline; perform bilingual Electron checks.
- [x] Fresh final code review, resolve important findings, update RUNBOOK/integration/reference docs and evidence.

## Execution ledger

- 2026-11-16: Clean master checkout reused on codex/ios-usb-wda. Xcode 26.6 available via explicit DEVELOPER_DIR; no devices or signing identities. User confirms code and automated validation first.
- Ruling: User already approved the architecture and implementation sequence; proceed without another design approval. No signing or installed-application changes in this phase.

- Tasks 1–3 complete for code/automated scope: USB target/HTTP loopback tests, screenshot/input/rotation/cancel/unknown outcome tests, per-device native window routing, replaykit framing/start/cleanup tests. Initial red tests observed before implementation; review regressions for PNG settings, missing display, early video config, broadcast cleanup and click latency were observed red and fixed.
- Ruling: No global broadcast stop endpoint — upstream cannot compare ownership atomically. Reuse an existing connected broadcast and stop only our capture; user ends the iOS recording indicator on the phone. UI/docs state this behavior.
- Ruling: Gesture timestamp is captured at input ingress, before queue/geometry reads; request timeout includes bounded action duration overhead. Geometry read failures are not treated as an executed write; ambiguous writes quarantine input.
- Task 4 validation: application tests 1147 pass / 2 skip with --test-concurrency=4; Licia normal/fallback each 606 pass / 4 pending. Default all-core initial run had one deadline timing failure while Xcode compiled, and one outdated device-list expectation; bounded concurrency final run passes without changing CLI behavior.
- Lint/i18n and main/preload/renderer builds pass. TypeScript 55 diagnostics match HEAD byte-for-byte (TS6 requires --ignoreDeprecations 6.0). Unsigned Xcode 26.6 build-for-testing passes for Runner and Broadcast extension; upstream warnings retained.
- Real Electron production React PNG/H264 decode and bilingual control checks pass; device IPC simulated. Independent final reviewer reported four important issues, all fixed and re-reviewed; focused review tests 18/18 pass.
- No signing identity or connected iPhone; no signed installation, device control, long-running stream, physical reconnect or Windows acceptance claimed. Changes remain reviewable in this checkout; no publishing or application installation performed.

- Final additional regression: Electron decoder failure requests PNG fallback even during video startup; two tests observed red then green. Reviewer independently rechecked 17/17 backend/renderer tests, no lifecycle deadlock. Final full suite 1147 pass / 2 skip; lint/build/UI/TypeScript comparison rechecked.
