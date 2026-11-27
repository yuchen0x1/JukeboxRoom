# JukeboxRoom v0.0.24

Release date: 2026-11-27 (Beijing Time) · [Compare with previous release](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.23...v0.0.24)

## Overview

This release fixes Socket.IO reconnect races, a Windows-only test isolation failure, and missing frontend build dependencies during production self-updates. The server now explicitly requires Node.js 24 or newer to match its dependencies.

## Fixes and improvements

- Retry an unfinished Socket.IO connection after its initial timeout without hanging.
- Ignore stale room-rejoin responses after leaving or switching rooms.
- Read isolated test paths through a structured result file instead of escaped TAP output.
- Install TypeScript and Vite dependencies when a production deployment rebuilds the client.

## Downloads

| File | Platform | Description |
|---|---|---|
| `jukeboxroom-server-0.0.24.zip` | Self-hosted, Node.js 24+ | Server deployment package |
| `jukeboxroom-web-0.0.24.tar.gz` | Web/PWA | Static web assets |
| `jukeboxroom-desktop-setup-0.0.24-x64.exe` | Windows x64 | Unsigned installer for legacy update compatibility |
| `jukeboxroom-desktop-setup-0.0.24-x64.exe.blockmap` | Windows x64 | Differential update metadata |
| `latest.yml` | Windows x64 | Update version and SHA-512 metadata |
| `SHA256SUMS.txt` | Checksums | SHA-256 manifest for public release assets |

## Upgrade notes

- Self-hosted Node.js deployments must upgrade to Node.js 24 or newer before updating.
- Existing data directories and configuration formats are unchanged.
- An unsigned Windows installer, `latest.yml`, and `.blockmap` are included so legacy desktop versions can receive this update. SmartScreen may warn on first run, and the unsigned new installation does not enable later in-app updates. No Android APK or iOS IPA is included.

## Verification

- Server: 151 tests passed, including 14 update-module tests.
- Client: 61 tests passed; TypeScript, production build, and bundle-budget checks passed.
- Desktop updater: 13 tests passed.
- Production dependency audits: zero known vulnerabilities across root, server, client, and desktop.
- Windows install/upgrade, Android/iOS devices, and long-running third-party music playback were not tested.

## Known limitations

- Existing Windows desktop users can receive this installer from this release; it is unsigned and does not enable later in-app updates.
- Node.js 20 and 22 are no longer supported for the current server dependency set.
- Music availability depends on external providers, account access, and network conditions.

[Full release history](docs/releases/release-notes.md) · [Deployment guide](docs/DEPLOY.md)
