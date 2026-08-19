# @deepseek-ai/dsh-client-mobile-web

English | [中文](README.zh.md)

Authenticated phone-browser access for the Web and desktop profiles. The Host starts a token-protected reverse proxy on all network interfaces; **Settings → Phone access** shows a local-network pairing QR and can start a temporary Cloudflare Quick Tunnel for public HTTPS access. A master action enables or disables the complete phone surface; disabling it closes both the proxy and tunnel and invalidates every issued link. The phone opens the existing responsive Web interface rather than a separate application.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `proxyPort` | `3081` | Port for the authenticated all-interface proxy; `0` selects a free port. |
| `tunnelStartupTimeoutMs` | `45000` | Maximum wait for `cloudflared` to publish a Quick Tunnel URL. |

The pairing URL carries a random process-lifetime bearer once. The proxy exchanges it for an `HttpOnly`, `SameSite=Strict` cookie and redirects to a URL without the bearer. Public HTTPS responses also mark the cookie `Secure`. Rotating or stopping the public tunnel invalidates existing pairing cookies. The phone-facing proxy rejects the `/mobile-web` control channel, and the settings section is registered only on the loopback browser surface.

The public action uses an existing `cloudflared` on `PATH` when available. On Windows x64 it can otherwise download the pinned official binary into `$DSH_HOME/mobile-web/bin/cloudflared.exe` after verifying its published SHA-256. Settings reports bytes received, total bytes, percentage, and transfer rate during that download. A 30-second idle timeout and a 15-minute total timeout turn a stalled transfer into a retryable error. The download honors standard `HTTPS_PROXY` and `HTTP_PROXY` environment variables without exposing their values to the browser; the desktop host supplies Electron's system HTTP/HTTPS proxy when neither variable is already set. Quick Tunnels are anonymous, temporary, and intended for personal testing or remote access rather than an always-on deployment. The settings page links Cloudflare's terms and privacy policy before the user enables the tunnel.

## Model Experience

### Phone access transport

#### What the model sees

Nothing. The `dsh_access` bearer, phone transport, QR generation, and tunnel state do not enter session messages or model requests.

#### Token effect

The transport contributes no model tokens.

#### KV Cache effect

The transport does not alter provider requests or their cache keys.

## Known Limitations and Deferred Work

- Quick Tunnel addresses change after restart and have no availability guarantee.
- Automatic `cloudflared` installation supports Windows x64 only; other platforms require it on `PATH`.
- Anyone who obtains a current pairing link can use the Harness with the Host process's permissions. Disable public access when it is not needed.
- The phone uses the responsive desktop Web interface; there is no offline mode, push notification service, or background mobile application.
