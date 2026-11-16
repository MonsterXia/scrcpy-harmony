# Mirror workspace implementation plan

Goal: implement approved grouped-device design in the existing Electron application.
Architecture: React/MobX state, existing device/session IPC; narrow focus/layout readback IPC; scoped SCSS and shared semantic theme colors.
Tech stack: TypeScript, React, SCSS, Electron; node:test and Playwright Electron.
Spec: docs/superpowers/specs/2026-11-16-mirror-workspace-design.md
Global constraints: preserve existing language changes; no device I/O during simulated acceptance; same light/dark geometry. Existing checkout codex/agent-automation. No automatic commit or install.
Review focus: selection vs active-session scope; asynchronous ordering and cleanup; truthful errors and retry; internationalization.

### Task 1: Session interaction and list UI
Files: Devices.tsx, Devices.module.scss, common/types.ts, preload/main.ts, main/window/{main,mirrorLayout,mergedMirrors}.ts, languages, test/plus-mirror-workspace.test.cjs.
Interfaces: getMirrorLayout(): Promise<MirrorLayout>; focusMirror(deviceKey): Promise<void>; existing startup/stop/layout APIs remain compatible.
Steps: add failing React interaction + backend focus/layout tests; run them RED; implement device list, bulk selection, active sessions, receiver and focus/layout readback; rerun GREEN.
Verification: node --test test/plus-mirror-workspace.test.cjs test/plus-mirror-modes.test.cjs.

### Task 2: Visual and integration acceptance
Files: script/check-plus-ui.mjs, integration.md, RUNBOOK.md, evidence/mirror-workspace-2026-11-16.
Interfaces: data-device-row, data-session-row, data-action, data-layout; simulate new IPC in Electron harness.
Steps: update acceptance to new interaction; check i18n/lint, application tests and three builds; run Electron screenshots in both themes and languages; inspect images and fix issues; document evidence and limitations; fresh reviewer of task changes.
Verification: npm run lint; node --test test/*.test.cjs; npm run build:main; npm run build:preload; npm run build:renderer; node script/check-plus-ui.mjs docs/scrcpy-plus/evidence/mirror-workspace-2026-11-16.

### Task 3: Unified overview and polling stability (user-added; execute before Task 2)
Files: store/index.ts, App.tsx, Workspace.tsx, DeviceSwitcher.tsx, Overview.tsx/SCSS, devices/android.ts and androidOverview.ts, devices/index.ts, preload/types, related tests.
Interfaces: overviewTarget/selectOverviewTarget; getDeviceOverview(key) dispatches to Android read-only metadata or existing Harmony overview; main Android connection reused for concurrent reads.
Steps: reproduce same-device polling flicker with test; update stale-response lifecycle tests to distinguish key change vs object replacement; implement unified in-page selector and Android information; test transport reuse/cleanup and unsupported controls; final Task 2 Electron acceptance includes both overview platforms and repeated polling.
Verification: node --test test/overview*.test.cjs test/workspace-navigation.test.cjs test/plus-devices.test.cjs test/plus-overview.test.cjs.
