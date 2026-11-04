# JukeboxRoom v0.0.10

> 📅 Released: 2026-11-04 ｜ 🏷️ Tag: `v0.0.10` ｜ 📦 Compare: [v0.0.9...v0.0.10](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.9...v0.0.10)

JukeboxRoom is a multiplayer music room system for song requests (Node.js server + React web client, plus Windows desktop and Android apps). This release makes the in-app "What's New" window sync live from GitHub Releases, so future versions no longer need to ship an updated changelog file.

---

## ✨ Highlights

- 🔄 **Live in-app changelog**: the "What's New" window now fetches release notes from GitHub Releases in real time — new entries appear automatically after each release, no more missing or stale logs.
- 🛟 **Offline fallback**: when the network is unavailable or the API fails, it falls back to the bundled `changelog.md` and de-duplicates entries by version, so the window is never empty or repetitive.
- 📜 **Backfilled entries**: the bundled changelog now includes the v0.0.8 and v0.0.9 entries for complete history.

## 🆕 New Features

### Live changelog sync from GitHub Releases (Desktop / Android / Web)

- New server endpoint `GET /api/update/changelog`: reads the most recent release notes from the GitHub Releases API (up to 15 entries), with a 10-minute server-side cache to reduce upstream requests.
- Supports the `UPDATE_GITHUB_TOKEN` (read-only token) to raise the GitHub anonymous rate limit, preventing log loading failures caused by throttling.
- GitHub requests reuse the existing validation chain (URL allowlist + DNS validation), keeping the same SSRF protection boundary as the update checker.

## 🔧 Improvements

- Rewritten changelog viewer logic: prefers live API content, merges in the bundled `changelog.md` as a fallback, and de-duplicates entries by version.
- Client requests use an AbortController, cancelling in-flight requests as soon as the dialog is closed.

## 🧹 Bug Fixes

- Backfilled the bundled changelog with the v0.0.8 and v0.0.9 entries, so those versions are no longer missing inside the app.

## 📥 Downloads

| Platform | File | Arch | Size | Notes |
|---|---|---|---|---|
| 🪟 Windows Desktop | [jukeboxroom-desktop-setup-0.0.10-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.10/jukeboxroom-desktop-setup-0.0.10-x64.exe) | x64 | ≈149 MB | NSIS installer with a built-in local server — no Node.js required |
| 🤖 Android | [jukeboxroom-android-0.0.10-debug.apk](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.10/jukeboxroom-android-0.0.10-debug.apk) | Universal (incl. arm64) | ≈38 MB | Standalone music player, no server address needed |

> 💡 Web / self-hosted users don't need the installers — pull the source or deploy with Docker, see the [README](https://github.com/yuchen0x1/JukeboxRoom#readme) and the [deployment guide](docs/DEPLOY.md).

## ⬆️ Installation & Upgrade

- **Windows Desktop**: run the installer to upgrade in place — user data and music-source account credentials are preserved. If Windows SmartScreen appears on first launch, verify the download comes from this project's GitHub Release and choose "Run anyway" (this build is not signed with a commercial code-signing certificate).
- **Android**: install the downloaded APK; if the system warns about "unknown sources", allow the installation. Upgrading over a previous install keeps favorites and local playlists.
- **Self-hosted (source / Docker)**: pull the latest code and restart the service as usual; if the one-click updater is configured, you can upgrade directly in the app.

## 🖥️ System Requirements

| Component | Requirements |
|---|---|
| Server deployment | Node.js ≥ 20 and npm; Redis optional (falls back to the built-in JSON store, best for small single-instance deployments) |
| Windows Desktop | Windows 10/11 (x64); server is bundled — no Node.js needed |
| Android | Android 6.0 (API 23) or later (targetSdk 35) |
| Network | The in-app changelog needs access to `api.github.com`; self-hosted servers need access to the music source APIs |

## ⚠️ Known Issues

- **Unsigned artifacts**: the Windows installer is not signed with a commercial code-signing certificate (SmartScreen may warn on first run); the Android package is a debug-signed APK.
- **GitHub rate limits**: without `UPDATE_GITHUB_TOKEN` configured, the in-app changelog relies on anonymous GitHub API requests; when throttled it falls back to the bundled changelog (which may be slightly older).
- **Bundle size**: the Three.js vendor chunk is large and Vite reports a size warning at build time (no functional impact).

## 📋 Changelog

- v0.0.9 → v0.0.10: <https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.9...v0.0.10>
- Notable commit: `0c35771` feat: sync the in-app changelog with GitHub Releases and backfill 0.0.8/0.0.9 entries
- Full history: [CHANGELOG.md](CHANGELOG.md) and the [Releases page](https://github.com/yuchen0x1/JukeboxRoom/releases).

## 🙏 Acknowledgements

- Thanks to the open-source projects powering this app: [Node.js](https://nodejs.org), [Express](https://expressjs.com), [Socket.IO](https://socket.io), [React](https://react.dev), [Vite](https://vite.dev), [Electron](https://www.electronjs.org), [Capacitor](https://capacitorjs.com), and more.
- Thanks to the Meting music-source aggregation API and its upstream music platforms.
- Thanks to the GitHub community and users reporting feedback in [Issues](https://github.com/yuchen0x1/JukeboxRoom/issues) and the QQ group.
