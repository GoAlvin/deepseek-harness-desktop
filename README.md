# DeepSeek Harness Desktop

English | [中文](README.zh.md)

![DeepSeek Harness Desktop hero](assets/desktop-hero.png)

DeepSeek Harness Desktop is an independent, open-source Windows desktop distribution built from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It packages the complete Harness Web interface, local agent runtime, native directory picker, and supervised backend into one Electron application.

This community distribution is not an official DeepSeek desktop release. The upstream Harness architecture and package sources remain attributed to DeepSeek AI under the [MIT license](LICENSE).

## Download

Download the Windows x64 installer from the [latest desktop release](https://github.com/GoAlvin/deepseek-harness-desktop/releases/tag/desktop-v0.1.0-rc.7):

- `DeepSeek-Harness-0.1.0-rc.7-x64.exe`
- SHA-256: `C9076856499C78DCD51F4885B068AEEB128A7113A4300540F1E795FBECB7D9AD`

The installer is not code-signed. Windows SmartScreen may display an unknown-publisher warning. Verify the SHA-256 digest before running the installer.

## Application preview

This screenshot shows the packaged Windows application running a real Harness session.

![DeepSeek Harness Desktop running on Windows](assets/desktop-screenshot.png)

## Features

- Complete DeepSeek Harness Web UI in a native desktop window.
- One application owns backend startup, readiness, shutdown, and crash cleanup.
- Native Windows folder selection without exposing Node or Electron APIs to the renderer.
- Loopback-only Harness server on a random local port.
- Custom application, installer, Start menu, and desktop shortcut icons.
- Packaged Koffi, Sharp, ripgrep, and `node-pty` native runtime support.
- Per-user Harness profiles, settings, credentials, and session persistence.

The desktop host keeps the selected workspace, local backend, and agent capabilities inside one loopback-only application boundary.

![DeepSeek Harness Desktop workspace and capability flow](assets/desktop-workflow.png)

<a id="run"></a>

## First run

1. Install and open DeepSeek Harness Desktop.
2. Choose a workspace folder.
3. Open **Settings → Models**, enter a DeepSeek API key, and save it.
4. Start a conversation in the selected workspace.

Provider credentials are stored below the application's per-user Harness data directory. The renderer receives only redacted credential descriptors; see the [provider guide](docs/user/guide/providers.md) for supported providers and storage behavior.

## Run from source

Requirements:

- Windows 10 or Windows 11, x64
- Node.js `^22.19` or `>=24`
- pnpm `11.7.0`

```powershell
git clone https://github.com/GoAlvin/deepseek-harness-desktop.git
cd deepseek-harness-desktop
corepack enable
pnpm install
pnpm run desktop
```

`pnpm run desktop` builds the repository and starts the desktop application. For the browser-only development path, run `pnpm dsh web`.

## Package the application

```powershell
pnpm run desktop:pack
pnpm run desktop:dist
```

`desktop:pack` creates an unpacked Windows application. `desktop:dist` creates the interactive NSIS installer under `dist-desktop-installer/`. Packaging details and smoke-test entry points live in the [desktop package reference](apps/desktop/README.md).

## Project layout

- [`apps/desktop/`](apps/desktop/) — Electron main process, packaging configuration, icons, and packaged-runtime smoke tests.
- [`apps/cli/`](apps/cli/) — `dsh` profile launcher and the parent-owned shutdown path used by the desktop host.
- [`packages/`](packages/) — Harness plugins, including the desktop-parent directory-picker transport.
- [`docs/`](docs/) — user, architecture, development, and extension documentation.
- [`vendor/`](vendor/) — pinned Cordis sources inherited from upstream Harness.

## Security model

The renderer has Node integration disabled, context isolation and Chromium sandboxing enabled, and permission requests denied. Navigation is restricted to the loading document and the exact loopback Harness origin. External HTTP and HTTPS links open in the operating-system browser.

The local Harness server listens only on `127.0.0.1`. This prevents remote network exposure but does not authenticate against another process running as the same Windows user. Do not proxy or rebind the local server outside loopback.

## Current limitations

- Windows x64 is the only packaged target.
- The installer has no publisher certificate or automatic updater.
- The real-directory plugin layout produces a large, inspectable installation because Harness profile Junctions cannot target packages inside an ASAR virtual filesystem.
- The project follows the upstream developer-preview compatibility policy and may contain breaking changes between releases.

## Documentation and contributing

Start with the [user guide](docs/user/guide/index.md), [desktop package reference](apps/desktop/README.md), [development guide](docs/development.md), and [architecture documentation](docs/architecture.md). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## License and upstream

The project is distributed under the [MIT license](LICENSE). Third-party dependencies and licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

DeepSeek Harness Desktop is derived from [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness). This repository publishes the independent desktop integration and binary distribution while retaining upstream notices and source attribution.
