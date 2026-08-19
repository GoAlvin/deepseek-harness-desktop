# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

`@deepseek-ai/dsh-desktop` is the Windows desktop host for DeepSeek Harness. It keeps the existing Web profile as the product surface, starts that profile as an owned local process, and presents it in a hardened Electron window. The [desktop-host Agent Note](../../.agents/notes/implemented/feature/2026-08-14-electron-desktop-host.md) owns the architectural decision and trade-offs.

## Run and package

Run these commands from the repository root:

- `pnpm run desktop` builds the repository and starts the desktop app.
- `pnpm run desktop:pack` builds an unpacked Windows x64 application.
- `pnpm run desktop:dist` builds the interactive NSIS installer.

Packaged output is written to `dist-desktop-installer/`. The installer is named `DeepSeek-Harness-<version>-x64.exe`; `win-unpacked/DeepSeek Harness.exe` is the directly runnable application produced beside it.

The installer assigns the supplied product mark to the application and its shortcuts. Shortcut targets use a versioned ICO resource under the installation's `resources/` directory so Windows Explorer does not retain Electron's default icon after an upgrade.

This workspace package remains private because the supported distribution is the NSIS installer, not an npm tarball.

## Window and appearance

On Windows, Electron hides the ordinary title row and keeps its native minimize, maximize, and close buttons in a Window Controls Overlay. An 8-pixel drag strip at the top moves the window without making the Harness toolbar or sidebar controls unclickable. The renderer still receives no Electron bridge.

The Web profile includes the MIT-licensed [Aqua appearance plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin). Aqua starts enabled and provides glass material, fluid or custom image/video backgrounds, brightness and blur controls, a particle whale, ambient marine decorations, and pointer effects. Its master switch is under **Settings → Plugins → Glass theme**; the detailed controls are under **Settings → General → Appearance**. Turning the master switch off restores the stock interface without changing the desktop host.

## Runtime contract

The Electron main process starts the built [`dsh web`](../cli/README.md) profile on a random `127.0.0.1` port. It stores desktop-owned Harness state below Electron's per-user application-data directory, under `harness/`, and disables telemetry unless `DSH_TELEMETRY_DISABLED` is explicitly overridden in the inherited environment.

The backend receives a Node IPC channel. Closing the window requests bounded whole-profile disposal; an unexpected parent disconnect triggers the same CLI shutdown path. The same authenticated-by-parent channel carries native directory-picker requests to Electron, which uses its own system dialog and returns only the selected path or cancellation. Startup failure, early backend exit, and shutdown timeout remain explicit failure states rather than detached background processes.

The packaged application keeps plugin packages in a real directory instead of `app.asar`. Harness maintains profile module-fallback junctions, and Windows junctions cannot target virtual paths inside an ASAR archive. Native dependencies such as `node-pty`, Koffi, Sharp, and packaged ripgrep therefore remain directly loadable by the supervised Electron Node runtime.

## Window security

The renderer runs with Node integration disabled, context isolation enabled, Chromium sandboxing enabled, and permission requests denied. Top-level navigation is restricted to the loading document and the exact local Harness origin. New windows are denied, and ordinary HTTP or HTTPS links open in the operating-system browser.

The Harness HTTP server listens only on loopback. It is not an authentication boundary against other processes already running as the same local user; do not expose its random port through a proxy or bind it to a non-loopback interface.

## Verification

`pnpm run test:desktop` covers backend URL validation, navigation policy, frameless-window options, parent-owned CLI shutdown, and the desktop picker IPC lifecycle. The desktop executable accepts `--smoke-test` for a hidden startup/load/shutdown pass. `tests/packaged-native-smoke.cjs` verifies the packaged Windows runtime can load Koffi, Sharp, ripgrep, and `node-pty`; the picker smokes cover the standalone fallback worker and the complete Electron-parent backend RPC path.

The desktop shell does not change model-visible behavior. Web browser snapshots cover the assembled Aqua settings and plugin inventory; the Electron and packaged-native smokes cover the host process and window behavior.

## Current limitations

The checked-in packaging target is Windows x64 only. A publisher certificate and automatic-update channel are not configured. The real-directory plugin layout also makes the installation larger and more inspectable than an ASAR-packed shell; it is required by the current profile junction contract.
