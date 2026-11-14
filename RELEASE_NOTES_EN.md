# JukeboxRoom v0.0.19

> 📅 Release date: 2026-11-14 ｜ 🏷️ Tag: `v0.0.19` ｜ 📦 Compare: [v0.0.18...v0.0.19](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.18...v0.0.19)

This release rebuilds the Migu SMS login flow around a session-bound passport implementation, verified end-to-end against the live service.

## Highlights

- **Session-bound login**: Live testing proved the SMS code is validated against the session that requested it (cookies + a stable fingerprint). The previous two-step implementation used unrelated requests, so even a correct code was rejected with "SMS code wrong or expired". Sending and verifying now reuse one session (kept in memory for 10 minutes).
- **Correct pacmtoken extraction**: The passport token comes from the token-validate response header/Set-Cookie; the SDK only scanned cookie names it already sent, so a fresh login could never obtain it.
- **Single-use token respected**: The ST token (`STnid…`) is one-time; token-validate is now called exactly once.
- **Verified live**: Send-code, login, and user-info checks were validated against the real Migu service; 9 regression tests cover session reuse, failure transparency, and token constraints.

## Download

| Platform | File | Notes |
|---|---|---|
| Windows desktop | `jukeboxroom-desktop-setup-0.0.19-x64.exe` | x64 NSIS installer with the local server bundled. Update metadata and a SHA-256 checksum manifest are included in the same Release. |

This release builds only the Windows desktop app. No Android APK is included.

## Upgrade notes

- Windows users can install over the existing version. The installer is not signed with a commercial code-signing certificate, so SmartScreen may warn on first launch.
- Windows users on v0.0.18 can open Settings, check for updates, confirm the download, and restart to install v0.0.19.
- Web and self-hosted users can pull `main` and restart using their existing deployment procedure.

## Known items

- The Windows installer is not signed with a commercial code-signing certificate and may trigger SmartScreen.
- Migu is an experimental unofficial integration; upstream changes may affect availability.

See [CHANGELOG.md](https://github.com/yuchen0x1/JukeboxRoom/blob/main/CHANGELOG.md), the [release-notes history](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/releases/release-notes.md), and [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases) for the full history.
