# iOS desktop provisioning implementation

User explicitly requested implementation and opted out of design questions. Work in the existing isolated checkout, preserving previous signing evidence.

Goal: desktop Apple ID login/2FA, target-specific WDA signing/install/start, persisted authorization and automatic renewal while the app runs and the device is connected.

Architecture: a bundled Rust isideload helper owns authentication and keychain identities; a bundled pymobiledevice3 helper owns inspection, DDI preparation and DVT ProcessControl background launch. Electron supervises bounded private stdio jobs, device locks, UI state and renewal. Unsigned WDA is prepared reproducibly from the pinned fork. No Xcode or Python requirement for end users. No automatic certificate revocation, no borrowing other applications' credentials. An identified old test certificate was revoked only after separate explicit user confirmation during acceptance.

- [x] Test and implement device provisioning state machine: deduplication, account/target binding, cancellation, 24-hour renewal window, busy-session deferral, retry backoff.
- [x] Implement Rust helper with pinned dependency/lockfile, password-only-in-memory login, 2FA, selectable team, keychain token/identity storage, exact USB target, bounded protocol and safe error codes.
- [x] Implement Python device helper and clean WDA archive creation; inspect installed profiles, mount DDI, start exact Runner and verify HTTP readiness.
- [x] Add strict main-process bridge, sender-bound IPC, setup/account UI and bilingual strings; wire connection and app lifecycle/renewal.
- [x] Bundle self-contained native helpers/WDA with checksums/licenses, update build and CI requirements.
- [x] Run targeted tests, lint/i18n, full build and packaged verification. Exercise real login/install/start and forced renewal with user credential handoff. Record limits separately from verified results.

Validation focus: cancel/late result races, no active-session replacement, wrong USB device/team, expired authorization, unavailable keychain, child hang/oversized output, DDI unavailable, app quit, offline renewal and retry storms. Actual seven-day expiry and Windows hardware require separate evidence; simulated time tests do not count as those.

2026-11-18: Integrated account/install/start and controlled-clock real renewal validated on the connected Mac/iPhone. Fixed manifest size rejection and already-mounted DDI startup. Actual seven-day elapsed time, clean-host/unmounted-DDI, independent integrated 2FA observation and Windows remain unverified. ReplayKit initially fell back after Runner restart and succeeded on retry. Formal arm64 app and DMG notarization, stapling, Gatekeeper, copied-app launch and signed-app ReplayKit checks passed. Credentials remain in the isolated validation scope; daily-profile adoption is separate. See ../../maintenance/ios-desktop-provisioning.md.
