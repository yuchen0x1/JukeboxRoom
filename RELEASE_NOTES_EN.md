# JukeboxRoom v0.0.20

> 📅 Release date: 2026-11-14 ｜ 🏷️ Tag: `v0.0.20` ｜ 📦 Compare: [v0.0.19...v0.0.20](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.19...v0.0.20)

This release fixes the update panels rendering release notes as raw HTML source.

## Highlights

- **Readable update notes**: electron-updater delivers GitHub release notes as converted HTML (`<h1>`, `<p>`, `<a href>`), while the panels previously only stripped Markdown syntax, so tags leaked into the UI. A shared plain-text converter (entity decoding, block tags to newlines, list bullets, Markdown fallback) now feeds the desktop settings panels and the web update toast.
- **Data hygiene**: Expired SMS codes used as test fixtures were replaced with fictional values.

## Download

| Platform | File | Notes |
|---|---|---|
| Windows desktop | `jukeboxroom-desktop-setup-0.0.20-x64.exe` | x64 NSIS installer with the local server bundled. Update metadata and a SHA-256 checksum manifest are included in the same Release. |

This release builds only the Windows desktop app. No Android APK is included.

## Upgrade notes

- Windows users can install over the existing version. The installer is not signed with a commercial code-signing certificate, so SmartScreen may warn on first launch.
- Windows users on v0.0.19 can open Settings, check for updates, confirm the download, and restart to install v0.0.20.
- Web and self-hosted users can pull `main` and restart using their existing deployment procedure.

## Known items

- The Windows installer is not signed with a commercial code-signing certificate and may trigger SmartScreen.
- Migu is an experimental unofficial integration; upstream changes may affect availability.

See [CHANGELOG.md](https://github.com/yuchen0x1/JukeboxRoom/blob/main/CHANGELOG.md), the [release-notes history](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/releases/release-notes.md), and [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases) for the full history.
