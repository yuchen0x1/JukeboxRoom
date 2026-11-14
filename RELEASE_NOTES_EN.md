# JukeboxRoom v0.0.18

> 📅 Release date: 2026-11-14 ｜ 🏷️ Tag: `v0.0.18` ｜ 📦 Compare: [v0.0.17...v0.0.18](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.17...v0.0.18)

This release keeps domestic music sources on direct connections when a rule-mode system proxy (e.g. Clash) is enabled, and fixes the Migu SMS login session parsing.

## Highlights

- **Rule-mode proxy compatibility**: Domestic music domains (NetEase/QQ/Kugou/Migu/Qishui and their CDNs) always bypass the system proxy inside the desktop app, so covers, lyrics, playback URL resolution, and the audio fallback no longer detour through a foreign proxy exit. Other traffic such as GitHub update checks still uses the system proxy.
- **Migu SMS login fix**: Login no longer fails with "no valid session returned" on correct verification codes — the passport token is now read from `result.token`. Failures surface the real upstream reason (e.g. "SMS code is wrong or expired").
- **NetEase media fix**: Restored cover and lyrics URLs from NetEase search results and related media access compatibility.
- **Queue management**: Multi-keyword search inside the queue, "my requests" filter, and confirmed batch removal; regular members can only remove their own requests, owners/admins can manage all queued songs.
- **Data safety**: Shared playlist reorder no longer drops or replaces entries on duplicate IDs; server tests run against isolated data directories by default.

## Download

| Platform | File | Notes |
|---|---|---|
| Windows desktop | `jukeboxroom-desktop-setup-0.0.18-x64.exe` | x64 NSIS installer with the local server bundled. Update metadata and a SHA-256 checksum manifest are included in the same Release. |

This release builds only the Windows desktop app. No Android APK is included.

## Upgrade notes

- Windows users can install over the existing version. The installer is not signed with a commercial code-signing certificate, so SmartScreen may warn on first launch.
- Windows users on v0.0.17 can open Settings, check for updates, confirm the download, and restart to install v0.0.18.
- Web and self-hosted users can pull `main` and restart using their existing deployment procedure.
- Android users should remain on their current installation; this release does not include a new APK.

## Known items

- The Windows installer is not signed with a commercial code-signing certificate and may trigger SmartScreen.
- Android APK releases are deferred until a stable release-signing setup is available.

See [CHANGELOG.md](https://github.com/yuchen0x1/JukeboxRoom/blob/main/CHANGELOG.md), the [release-notes history](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/releases/release-notes.md), and [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases) for the full history.
