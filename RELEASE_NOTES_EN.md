# JukeboxRoom v0.0.15

> 📅 Release date: 2026-11-12 ｜ 🏷️ Tag: `v0.0.15` ｜ 📦 Compare: [v0.0.13...v0.0.15](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.13...v0.0.15)

This release completes GitHub-based automatic updates for the Windows desktop app and includes recent performance, reliability, and data-safety improvements.

## Highlights

- **Windows desktop updates**: Check stable GitHub Releases, choose whether to download, see real download progress, and confirm before the app exits and installs the update.
- **Windows packaging fix**: Fixed the `rcedit.exe` lookup that prevented GitHub Actions from producing the desktop installer.
- **Lighter initial load**: Three.js is loaded only when 3D visuals are needed; static assets are compressed and use tiered caching.
- **Safer local data**: Uninstalling the desktop app preserves user data. Settings can open the data folder or clear it after a second confirmation.
- **Reliability and security**: Tightened media-proxy boundaries, hardened room-event, health-check, and API error handling, and improved PWA update caching and network-error feedback.

## Download

| Platform | File | Notes |
|---|---|---|
| Windows desktop | `jukeboxroom-desktop-setup-0.0.15-x64.exe` | x64 NSIS installer with the local server bundled. Update metadata and a SHA-256 checksum manifest are included in the same Release. |

This GitHub Actions release builds only the Windows desktop app. No Android APK is included, to avoid publishing an APK signed with a temporary debug key that could not upgrade existing installations.

## Upgrade notes

- Windows users can install over the existing version. The installer is not signed with a commercial code-signing certificate, so SmartScreen may warn on first launch.
- Web and self-hosted users can pull `main` and restart using their existing deployment procedure.
- Android users should remain on their current installation; this release does not include a new APK.

## Known items

- The Windows installer is not signed with a commercial code-signing certificate and may trigger SmartScreen.
- Android APK releases are deferred until a stable release-signing setup is available.

See [CHANGELOG.md](CHANGELOG.md), the [release-notes history](docs/releases/release-notes.md), and [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases) for the full history.
