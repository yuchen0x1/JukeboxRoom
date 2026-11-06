# JukeboxRoom v0.0.12

> 📅 Released: 2026-11-06 ｜ 🏷️ Tag: `v0.0.12` ｜ 📦 Compare: [v0.0.11...v0.0.12](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.11...v0.0.12)

JukeboxRoom v0.0.12 is a hotfix release after the v0.0.11 cyberpunk experience release. It fixes the hard-coded home version badge, synchronizes package metadata across all workspaces, and republishes the Windows and Android artifacts. The full v0.0.11 baseline remains included: cyberpunk UI, keyboard shortcuts, equalizer, cross-source matching, and the security/dependency review.

---

## ✨ Highlights

- 🛸 **Full cyberpunk UI overhaul**: neon glows, holographic gradients, scanline sweeps, HUD corner brackets and a glowing matrix backdrop across the lobby, player and desktop app.
- ⌨️ **Complete keyboard shortcut system**: Space to play/pause, combo keys to skip and adjust volume, `/` to jump to search.
- 🎚️ **Five-band Web Audio equalizer**: Flat / Bass Boost / Clear Vocal / Treble Boost / V-Shaped — real-time client-side filtering with zero server cost.
- 🔀 **Cross-source smart matching**: finds a playable same-name version on another platform when the current one can't be played.
- 🛡️ **Deep security review**: 0 vulnerabilities in both production and dev dependency audits, with node-leak and cross-environment compatibility fixes.

## 🆕 New Features

### Keyboard shortcuts (web room / desktop)

| Shortcut | Action |
|---|---|
| `Space` | Play / pause |
| `Ctrl / Cmd + →` | Next track (regular members file a skip vote) |
| `Ctrl / Cmd + ←` | Previous track / replay |
| `Ctrl / Cmd + ↑ / ↓` | Volume up / down (5% steps, with live feedback) |
| `/` or `Ctrl / Cmd + F` | Focus the search box |

> Automatically suppressed while typing in inputs, chat boxes or editable regions.

### Five-band audio equalizer (EQ)

- Real-time `BiquadFilterNode` chain built on the Web Audio API with 5 presets: **Flat / Bass Boost / Clear Vocal / Treble Boost / V-Shaped**.
- Cascades with the room's 3D spectrum visual pipeline; the selected preset is remembered locally.

### Cross-source smart matching

- Matches a same-name, same-artist playable version across the other music platforms when the current source is unavailable (VIP / no license).

### Playlist import & export

- Stronger external playlist link parsing: NetEase mobile short links (`163cn.tv`) and multiple QQ Music path formats (`taoge` / `details` / `tid`) can now be pasted directly.
- The room queue panel gains an **Export** button that writes a JSON backup for easy migration or sharing.

### Desktop tray enhancements

- The tray menu now shows the current track title and offers **Play / Pause** and **Next Track** controls, so you can control playback without restoring the window.

## 🎨 UI Overhaul Details

- **Lobby**: room cards are now "dynamic nodes" — HUD targeting corners, hover lift, glowing borders, an energy rail plus a 4-band animated spectrum for active rooms; the header became an instrument-panel style HUD (`ACTIVE NODES` counter, pulsing status light, glowing matrix backdrop).
- **Room page**: the room id became a monospace terminal badge (`ROOM-ID #xxxxxx`); workspace tabs gained neon backlight and glowing outlines; the search status bar got a side plasma light bar.
- **Full-screen player**: the vinyl now carries a slowly rotating holographic radar ring and a playback-state outer glow; the main play button became a cyan-gradient glowing control core.
- **Desktop app**: sidebar active items get neon inner glow and the status dot pulses.

## 🧹 Bug Fixes & Security

- Fixed `roomStore` throwing `localStorage is not defined` when loaded in non-browser contexts (Node / test runners) — now uses guarded reads/writes with fallbacks.
- Fixed an **audio node leak** where stale `BiquadFilterNode` instances were not disconnected when the equalizer chain was re-attached.
- Added filename sanitization for playlist exports so Windows-reserved characters can't break the download.
- Removed a duplicated comment in `coverBackdrop`; cover palette extraction keeps its tainted-canvas fallback so rendering never crashes.
- Dependency hygiene: cleared the known `glob` / `minimatch` advisories from client dev dependencies — `npm run audit:prod` and the full dev audit both report **0 vulnerabilities**.
- Expanded regression coverage: 5 new client cases for EQ presets, playlist export parsing and bilingual lyric merging (client tests 17 → 22; server stays at 92).

## 📥 Download & Install

| Platform | File | Architecture | Size | Notes |
|---|---|---|---|---|
| 🪟 Windows desktop | [jukeboxroom-desktop-setup-0.0.12-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.12/jukeboxroom-desktop-setup-0.0.12-x64.exe) | x64 | ≈149 MB | NSIS installer with an embedded local server — no Node.js required |
| 🤖 Android | [jukeboxroom-android-0.0.12-debug.apk](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.12/jukeboxroom-android-0.0.12-debug.apk) | universal (arm64 etc.) | ≈38 MB | Standalone music player — no server address needed |

> 💡 Web / self-hosted users don't need an installer: pull the source or deploy with Docker. See the [README](https://github.com/yuchen0x1/JukeboxRoom#readme) and [deployment guide](docs/DEPLOY.md).

## ⬆️ Upgrade Notes

- **Windows desktop**: run the installer to upgrade in place — user data and music-source credentials are preserved. If Windows SmartScreen appears, verify the download came from this project's GitHub Release before choosing "Run anyway" (builds are not code-signed with a commercial certificate).
- **Android**: install the APK and allow installation from unknown sources if prompted. Installing over an existing version keeps favorites and local playlists.
- **Self-hosted (source / Docker)**: pull the latest code and restart the service as usual; if one-click update is configured, use it inside the app.

## 🖥️ Requirements

| Target | Requirements |
|---|---|
| Server deployment | Node.js ≥ 20, npm; Redis optional (built-in JSON store otherwise — best for small single-instance deployments) |
| Windows desktop | Windows 10/11 (x64); server bundled, no Node.js needed |
| Android | Android 6.0 (API 23) or newer (targetSdk 35) |
| Network | In-app changelog needs `api.github.com`; self-hosted servers need access to the music-source APIs |

## ⚠️ Known Issues

- **Unsigned artifacts**: the Windows installer isn't signed with a commercial code-signing certificate, so SmartScreen may warn on first run; the Android APK is debug-signed.
- **Equalizer conditions**: the EQ rides on the Web Audio chain and works best with a 3D spectrum background (Galaxy / Topography / Vinyl). In plain cover-background mode the browser may skip spectrum wiring due to cross-origin restrictions.
- **Bundle size**: the Three.js vendor chunk is large and triggers a Vite size warning (no functional impact).

## 📋 Changelog

- v0.0.11 → v0.0.12: <https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.11...v0.0.12>
- Full history: [CHANGELOG.md](CHANGELOG.md) and the [Releases page](https://github.com/yuchen0x1/JukeboxRoom/releases).

## 🙏 Thanks

- Built on [Node.js](https://nodejs.org), [Express](https://expressjs.com), [Socket.IO](https://socket.io), [React](https://react.dev), [Vite](https://vite.dev), [Electron](https://www.electronjs.org), [Capacitor](https://capacitorjs.com) and more.
- Thanks to the Meting aggregation API and the upstream music platforms.
- Thanks to the community for [Issues](https://github.com/yuchen0x1/JukeboxRoom/issues) and feedback in the QQ group.
