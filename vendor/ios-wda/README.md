# Device-side WDA source and local patch

`manifest.json` pins the droidrun/WebDriverAgent source commit, archive hash and license. `script/ios-wda.mjs` downloads that source into ignored `build/ios-wda`; no prebuilt mobilerun-ios executable is included.

`session-ownership.patch` is a Scrcpy Plus modification to `FBSessionCommands.m`. The upstream serialized session-creation handler now refuses an existing active session instead of terminating it. Status advertises ownership protocol version 1 and a process UUID. A creation request carrying a different expected UUID is refused before allocating a session. This prevents both concurrent-client replacement and allocation into a Runner that restarted between status and creation.

The manifest records the patch, original target and patched target SHA-256 values. Preparation verifies those hashes and applies the patch once; unexpected source modifications fail rather than being overwritten. Rebuild and reinstall the dedicated signed Runner when upgrading from an unpatched version. The desktop rejects an older Runner before session creation.
