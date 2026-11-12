# JukeboxRoom v0.0.17

> 📅 Release date: 2026-11-13 ｜ 🏷️ Tag: `v0.0.17` ｜ 📦 Compare: [v0.0.16...v0.0.17](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.16...v0.0.17)

This release fixes desktop media and embedded-server behavior when Windows uses a system proxy, while retaining the transparent multi-size Windows icon shipped in v0.0.16.

## Highlights

- **System-proxy compatibility**: External requests continue to use the Windows system proxy, while `localhost`, `127.0.0.1`, and `::1` always bypass it so proxy tools cannot intercept the embedded local server.
- **Audio playback fallback**: Desktop audio tries the local media proxy first, then retries the original CDN URL through Chromium/system proxy when the local proxy is unreachable.
- **Clearer failures**: Audio loading timeout, cancellation, network interruption, and unsupported-format states now produce actionable playback errors.
- **Regression coverage**: Added tests for proxy bypass rules, playback URL fallback, updater behavior, and packaged desktop resources.
- **Consistent icon resources**: The EXE, installer, shortcuts, taskbar, title bar, and tray continue to use the same transparent multi-size icon.

## Download

| Platform | File | Notes |
|---|---|---|
| Windows desktop | `jukeboxroom-desktop-setup-0.0.17-x64.exe` | x64 NSIS installer with the local server bundled. Update metadata and a SHA-256 checksum manifest are included in the same Release. |

This GitHub Actions release builds only the Windows desktop app. No Android APK is included, to avoid publishing an APK signed with a temporary debug key that could not upgrade existing installations.

## Upgrade notes

- Windows users can install over the existing version. The installer is not signed with a commercial code-signing certificate, so SmartScreen may warn on first launch.
- Windows users on v0.0.16 can open Settings, check for updates, confirm the download, and restart to install v0.0.17.
- Web and self-hosted users can pull `main` and restart using their existing deployment procedure.
- Android users should remain on their current installation; this release does not include a new APK.

## Known items

- The Windows installer is not signed with a commercial code-signing certificate and may trigger SmartScreen.
- Android APK releases are deferred until a stable release-signing setup is available.

See [CHANGELOG.md](CHANGELOG.md), the [release-notes history](docs/releases/release-notes.md), and [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases) for the full history.
