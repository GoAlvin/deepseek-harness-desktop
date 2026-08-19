# Agent Note: Electron desktop host

Status: implemented

English | [中文](2026-08-14-electron-desktop-host.zh.md)

## Problem

DeepSeek Harness ships a browser application and a `dsh web` launcher, but no installable desktop owner. Asking a person to start a server, discover its port, keep the terminal open, and close the plugin tree correctly is not a Codex-like desktop experience. Wrapping only the URL would also leave process ownership, navigation trust, native-module ABI, profile storage, and Windows packaging undefined.

## Decision

Add a private `@deepseek-ai/dsh-desktop` Electron application. The Electron main process owns one child running the built `dsh web --port 0` profile under Electron's Node mode, reads its exact loopback ready line, and loads only that origin. The renderer receives no Node API or preload bridge; existing Web RPC remains the sole product interface.

The desktop host gives the child a dedicated `DSH_HOME` below Electron's per-user application-data directory and defaults `DSH_TELEMETRY_DISABLED` to `1`. It launches the child with Node's bundled internal ESM loader exposed because Electron's Node ABI cannot load the host Node installation's `node-addon-require-builtin` binary. This uses the Loader's already-supported internal path instead of introducing a second plugin-resolution algorithm.

## Process ownership

The child receives a Node IPC channel. The desktop host sends one exact shutdown message and waits for bounded whole-profile disposal before forcing termination. The CLI also treats parent disconnect as a shutdown request, so a crashed or terminated desktop parent does not intentionally leave the Web profile detached. Shutdown cancellation is installed before profile boot, and disposal waits for the root context to publish when the request arrives during startup.

The same channel carries a separate request/response protocol for the Windows directory picker. The desktop-launched backend opts in through an environment marker, asks the Electron parent to call `dialog.showOpenDialog`, and receives only a path or cancellation. Message validation and request IDs keep this capability scoped to the owning parent; the renderer still receives no Electron or Node bridge.

The desktop window treats startup failure and unexpected backend exit as application failures. Single-instance locking prevents two owners from racing over the same desktop state. This follows the repository's [defensive lifecycle patterns](../../../../docs/defensive-patterns.md): independently observed exit facts are preserved, cleanup is bounded, and startup plus shutdown races have one explicit owner.

## Packaging

The Windows x64 distribution uses Electron Builder and NSIS, with the supplied product mark applied to the window, executable, installer, and shortcuts. The desktop workspace package remains private because the installer, rather than an npm tarball, is the supported distribution. NSIS points shortcuts at a versioned ICO copied into `resources/`, preventing Explorer from retaining Electron's default icon after an upgrade. Native packages use their shipped prebuilds, so packaging skips Electron's source rebuild; this avoids making a local Visual Studio Spectre-library installation a product-build prerequisite. A packaged-native smoke exercises Koffi, Sharp, ripgrep, and `node-pty` under the final Electron runtime.

Ordinary Windows hosts retain the koffi worker fallback. Its IPC channel remains connected after the non-terminal `showing` notice and closes only after `done` or `error` flushes. The desktop host does not use that worker: delegating the dialog to Electron removes a second executable launch and avoids intermittent worker termination observed under an installed GUI process.

Plugin packages remain under `resources/app/node_modules` with ASAR disabled. The profile launcher creates module-fallback Junctions into its installation. A Junction into `app.asar` is a dangling filesystem target even though Electron itself can read that virtual path, so unpacking only native binaries is insufficient. The explicit host dependency list also closes production peer edges that Electron Builder's pnpm traversal does not infer.

## Window boundary

The BrowserWindow enables context isolation, Chromium sandboxing, and Web security while disabling Node integration. Permission requests and webviews are denied. Top-level navigation is allowlisted to the loading document and the exact backend origin; new windows are denied, while ordinary HTTP and HTTPS links are delegated to the operating-system browser.

On Windows, the BrowserWindow uses Electron's hidden title-bar style and native Window Controls Overlay. The renderer receives a narrow CSS drag region through `webContents.insertCSS`; it receives no preload bridge or window-control IPC. Native minimize, maximize, and close buttons therefore remain Electron-owned while the ordinary title row is absent.

The Web bundle pins `dsh-client-ui-aqua` as an external MIT-licensed runtime dependency and mounts it in the shipped browser roster. Aqua owns its local appearance preferences and removes all of its effects when its settings switch is disabled. The desktop host does not fork or modify the plugin source, and the plugin receives only the same client services available to other Web roster entries.

The random server port listens only on `127.0.0.1`. This prevents remote network exposure but does not authenticate against another process running as the same local user. The port must not be proxied or rebound outside loopback without adding an authentication boundary.

## Alternatives considered

**Tauri with a Node sidecar.** Rejected for this increment: Harness is a Node plugin graph with native Node dependencies. Tauri would still require shipping and supervising a separate Node runtime, while adding a second desktop toolchain before the lifecycle contract existed.

**Import the Web profile into Electron's main process.** Rejected: plugin failures, process-level handlers, and shutdown would share the GUI's failure domain. A child preserves the CLI's tested composition and gives backend lifetime a clear owner.

**Open the Web URL in the default browser.** Rejected: it does not provide a single-instance application, trusted navigation boundary, owned shutdown, desktop storage location, or installer.

**Package every module inside ASAR and unpack only native files.** Rejected: the profile module-fallback contract requires real Junction targets for JavaScript packages as well as native binaries.

**Set `frame: false` and implement custom window buttons through a preload bridge.** Rejected: hidden title-bar mode removes the title row while retaining Electron-owned controls. Custom controls would add renderer-to-main IPC and platform-specific window-state handling without improving the requested result.

**Vendor or copy Aqua into the application.** Rejected: the published package exposes the standard Harness client-plugin entry and has a compatible MIT license. Pinning the npm dependency preserves its upstream identity, integrity metadata, and independent update path.

## Consequences

The application builds, launches, and shuts down as a Windows desktop product while reusing the complete Web interface. Desktop tests pin the title-bar options and drag region, packaged startup smokes cover the host process, and Web browser snapshots cover the Aqua settings and roster entry. The host and appearance layer add no model-visible behavior.

The installer is large, its plugin tree is inspectable on disk, and it currently has no publisher certificate or automatic updater. The first packaging target is Windows x64. Other platforms need their own native-runtime and installer validation before being declared supported. Aqua remains third-party code pinned by the Web bundle; adopting a later release requires the same browser and packaged-runtime verification as any other roster change.
