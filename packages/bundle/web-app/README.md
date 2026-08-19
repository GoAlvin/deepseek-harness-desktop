# `@deepseek-ai/dsh-web-app`

English | [中文](README.zh.md)

The dsh browser-surface bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-base`](../base/README.md): it sets the coding persona, inserts the Web host rows (webserver, API gateway, workspace, projection cache, storage) and the browser plugin roster, the always-on client-plugin reload chain ([`dsh-client-hmr`](../../client/hmr/README.md), idle until a rebuild watcher rewrites client bundles), and mounts this package's `web-runtime` glue plugin (config `{printUrl, surfaceContext, trustedHosts}`). That plugin resolves the built frontend dist through `@deepseek-ai/dsh-web-frontend`'s exports, samples bind-dependent LAN trust once, provides it as `webRuntime` to the browser-trust fence and client roster, mounts the [`frontend-static`](../../host/frontend-static/README.md) fallback owner, registers the harness-source and web-surface prompt sections plus the bash-visible `DSH_WEB_URL` runtime variable when `surfaceContext` is true, and prints the `dsh web:` URL line when `printUrl` is true, after its Loader tree settles so a sibling failure cannot announce a dead app. This bundle also owns the app command line: the ordinary `web-startup` provider ([`src/startup.ts`](src/startup.ts)) injects `ctx.cmdlineArgs` ([`dsh-cmdline`](../../boot/cmdline/README.md)), parses `--host`, `--port`, repeatable `--trusted-host`, and the app's `--help`, then provides `webStartup`. It rejects `--host 0.0.0.0` before publishing that service because the CLI intentionally does not support all-interfaces binding yet. Flag-configured rows inject the service and read it directly from lazy config, so nothing binds a port before argument resolution and `dsh --profile web --help` starts no server. [`dsh-headless`](../headless/README.md) is a sibling surface over the same base and does not mount this bundle.

## Browser appearance

The shipped roster enables the external MIT-licensed [Aqua plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin). It adds a reversible glass-material layer and appearance controls without changing model requests or session data. A person can disable the layer under **Settings → Plugins → Glass theme** and adjust its material, background, ambient, and pointer effects under **Settings → General → Appearance**.

## Cost accounting

The roster pins the external MIT-licensed [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) at `1.5.19`. It places today's cost immediately above Settings, keeps per-session cost below the composer by default, and provides aggregate costs, budgets, official balance and Coding Plan queries, history, a token heat map, peak pricing, custom-provider balance support, and price synchronization under **Settings → Cost**. Provider secrets resolve through the Host credentials service and are not sent to the browser. Custom balance queries are disabled by default. The local ledger is `$DSH_HOME/storages/cost-meter/ledger.json`; it does not modify workspace files or session messages.

## Phone browser access

The roster mounts [`dsh-client-mobile-web`](../../client/mobile-web/README.md). **Settings → Phone access** presents an authenticated local-network QR and an opt-in temporary public HTTPS QR. Its master action closes both transports and invalidates their links. Public access runs a pinned Cloudflare Quick Tunnel, and its optional binary download reports byte and transfer-rate progress; this is a browser surface, not a mobile application.

## Model Experience

### Harness-source and Web-surface context

#### What the model sees

When `surfaceContext` is true, the `harness:source` section identifies the on-disk Harness implementation without claiming it is the working directory, and the `app:web-surface` global section (order −98) orients the model to the GUI: the canonical local URL, the "this page" referent, the update contract (the reload receiver is always on; no-refresh reloads additionally need the `pnpm run dev:web` watcher), and the instruction not to start replacement servers. `DSH_WEB_URL` additionally appears in the managed bash environment with its description, resolved per invocation from the live server. When it is false, neither section nor the variable is registered.

#### Token effect

One source line and one prompt paragraph per session plus two managed-environment variable lines; constant per process.

#### KV Cache effect

The prompt section sits near the system prompt's head and is stable for the life of the process (the port is a boot fact), so it does not invalidate the cache across turns.

## Known Limitations and Deferred Work

- **The frontend dist must be built** — `require.resolve` of the dist fails loud at activation with a build hint; there is no source-serving fallback.
- **`lanAddresses` is a boot-time snapshot** — interface changes after boot are not re-advertised; the printed LAN URL always matches the configured trust fence.
