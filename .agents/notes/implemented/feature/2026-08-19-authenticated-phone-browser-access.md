# Agent Note: Authenticated phone browser access

Status: implemented

English | [中文](2026-08-19-authenticated-phone-browser-access.zh.md)

## Problem

The Web profile listens on loopback because its Host trust checks are not an authentication layer. A phone cannot reach that surface from another network, while binding the existing server to all interfaces would expose session control, filesystem tools, and command execution without a credential. A separate phone application would duplicate the Web client and would not address safe public ingress.

## Decision

Add `@deepseek-ai/dsh-client-mobile-web` as a Host-and-browser plugin in the Web roster. The Host keeps the ordinary Web server on loopback and starts a separate reverse proxy on all interfaces. That proxy accepts requests only after a random process-lifetime bearer has been presented in a pairing URL, exchanges the bearer for an `HttpOnly` and `SameSite=Strict` cookie, removes it from the visible URL, and forwards HTTP and WebSocket traffic to the loopback server with the authority fields that server expects. Public HTTPS responses add `Secure` to the cookie.

The browser half contributes **Settings → Phone access** only when the controlling page is on loopback. It shows a local-network QR and controls an optional Cloudflare Quick Tunnel. A master action stops or restarts the complete phone transport; stopping it closes the local proxy and tunnel, rotates the bearer, and invalidates current phone cookies. The phone-facing proxy rejects the control channel before forwarding, so a paired phone can use Harness but cannot mint or stop its own public ingress.

Windows x64 can download the exact official `cloudflared` `2026.8.2` executable into `$DSH_HOME/mobile-web/bin/` when `PATH` has no usable command. The executable is accepted only when its SHA-256 equals the digest published on the upstream GitHub release. The settings state reports byte count, total size, percentage, and transfer rate; idle and total timeouts turn stalled transfers into explicit failures. The downloader honors standard `HTTPS_PROXY` and `HTTP_PROXY` environment variables without forwarding their values to the browser. When neither value exists, the desktop host adapts Electron's resolved system HTTP/HTTPS proxy into the backend environment. Other platforms require a usable `cloudflared` on `PATH`. Download and tunnel startup occur only after the user presses the public-access action; the settings page states that Quick Tunnels are temporary and links Cloudflare's terms and privacy policy.

The phone renders the existing responsive Web interface. There is no mobile executable, separate session store, synchronization protocol, cloud account, or committed third-party plugin source.

## Alternatives considered

**Package `dsh-pocket` directly.** Rejected because its repository is GPL-2.0 while DeepSeek Harness is MIT. Shipping that package in the desktop distribution would introduce incompatible distribution obligations for this project. Its browser-access workflow informed the product requirement, but no source or stylesheet is copied.

**Bind the main Web server to `0.0.0.0`.** Rejected because the existing trusted-host list prevents DNS rebinding but does not authenticate a remote operator. A dedicated authenticated proxy keeps ordinary desktop and CLI access loopback-only.

**Ship a native phone application.** Rejected because the user wants browser access and the complete session client already exists on the Web surface. An application would add another release, update, and platform-permission lifecycle without improving ingress authentication.

**Require a Cloudflare account and named tunnel.** Rejected for the zero-configuration personal-access flow. Named tunnels provide stable addresses and operational controls, but they also require account credentials and durable configuration. The shipped Quick Tunnel is explicit, temporary, and off by default.

## Consequences

A desktop user can pair a phone on the same network or deliberately expose the same session through a temporary public HTTPS address. The reverse proxy tests pin bearer exchange, cookie flags, authority rewriting, private control routing, and token rotation. The bundle configuration and browser build checks pin plugin resolution and settings registration.

The bearer grants the holder the same Harness capabilities as the local browser, including tools that act with the Host process's permissions. Users must treat every QR and URL as a credential and close public access after use. Quick Tunnels have no availability guarantee, change address after restart, and are not a production remote-access service. The first automatic binary path supports Windows x64 only.
