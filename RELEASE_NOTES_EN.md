# JukeboxRoom v0.0.21

> 📅 Release date: 2026-11-16 ｜ 🏷️ Tag: `v0.0.21` ｜ 📦 Compare: [v0.0.20...v0.0.21](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.20...v0.0.21)

This release hardens provider requests, QR login redirects, and runtime health handling.

## Highlights

- **Safer QQ QR login redirects**: only known HTTPS QQ login hosts are accepted, and every response redirect or HTML navigation hop is checked for DNS, private-network, and SSRF violations.
- **Bounded provider requests**: provider JSON calls use the safe outbound fetcher with DNS, private-target, redirect, and response-size limits; controlled QR sessions keep multiple `Set-Cookie` values.
- **Health and observability**: unhealthy processes keep the health probe available while new business API calls return 503; rate limits include `Retry-After`; health metadata includes version and storage details; Prometheus metrics record cumulative duration and status counts.
- **Cookie transport**: identity cookies set `Secure` according to `req.secure` for HTTPS requests.
- **Promo page and build hygiene**: added a deployable EdgeOne Pages landing page with current desktop screenshots, linked the official site from the README, and pinned desktop `minimatch` to 11.0.1.

## Download

| Platform | File | Notes |
|---|---|---|
| Windows desktop | `jukeboxroom-desktop-setup-0.0.21-x64.exe` | x64 NSIS installer with the local server bundled. Update metadata and a SHA-256 checksum manifest are included in the same Release. |

This release builds only the Windows desktop app. No Android APK or iOS IPA is included.

## Upgrade notes

- Windows users can install over the existing version. The installer is not signed with a commercial code-signing certificate, so SmartScreen may warn on first launch.
- Windows users on v0.0.20 can open Settings, check for updates, confirm the download, and restart to install v0.0.21.
- Web and self-hosted users can pull `main` and restart using their existing deployment procedure.

## Known items

- The Windows installer is not signed with a commercial code-signing certificate and may trigger SmartScreen.
- Migu is an experimental unofficial integration; upstream changes may affect availability.

See [CHANGELOG.md](https://github.com/yuchen0x1/JukeboxRoom/blob/main/CHANGELOG.md), the [release-notes history](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/releases/release-notes.md), and [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases) for the full history.
