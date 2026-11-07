# JukeboxRoom v0.0.13

> 📅 Released: 2026-11-08 ｜ 🏷️ Tag: `v0.0.13` ｜ 📦 Compare: [v0.0.12...v0.0.13](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.12...v0.0.13)

JukeboxRoom v0.0.13 is the "Admin Console" release: a standalone admin dashboard with its own login page, public self-service registration, environment-driven bootstrap of the first super admin, and a role system with hard safety boundaries. The previous baselines — cyberpunk UI, keyboard shortcuts, equalizer, cross-source matching — all remain included.

---

## ✨ Highlights

- 🛡️ **Full admin console**: Overview, Users, Rooms, Tasks, Audit, Library and AutoDJ — seven tabs for day-to-day operations.
- 👤 **Closed-loop accounts**: the console login page supports public self-service registration, and regular users can never reach the console.
- 👑 **Safe role management**: only super admins can change roles — no self-demotion, and the last super admin can never be demoted.
- 🔑 **No default password**: the first super admin is only created from explicit environment variables; no fixed credentials exist anywhere in the repo or logs.
- 🏠 **Stronger room management**: admins can broadcast room announcements and force-close rooms.

## 🆕 New Features

### Standalone admin console (`/admin`)

- Seven tabs: **Overview** (system health and stats), **Users** (search / ban / role changes), **Rooms** (list / announce / force-close), **Tasks** (definitions / runs / history), **Audit** (operation logs), **Library** (local songs and scanning), **AutoDJ** (status and toggle).
- A "Admin Console" entry was added to the home footer; the route is lazily loaded so the first screen stays lean.

### Login & registration

- Standalone login page at `/admin/login` with a one-click login/register mode switch.
- Admin sessions are stored as access/refresh tokens; requests carry `Authorization: Bearer` automatically and a 401 clears the local session.
- Regular accounts that try to open the console are rejected explicitly: "this account is not an administrator".
- Public registration always creates a `user` role — the server ignores any privilege fields sent in the request.

### First super-admin bootstrap

```env
ADMIN_INIT_USERNAME=admin
ADMIN_INIT_PASSWORD=replace-with-random-8-plus-chars
```

- Both variables must be set together; configuring only one logs a warning and skips creation.
- Username length 2-32, password length 8-128, and the username must not already exist.
- Logs print only the username — **never the password** — and the variables can be removed after creation.
- Desktop builds skip this bootstrap (the web console targets self-hosted deployments).

### Role management with safety boundaries

- Super admins can change roles directly in the Users tab: `super_admin / admin / moderator / user`.
- Regular admins cannot change any role; a super admin cannot demote themselves; the last super admin cannot be demoted.
- Any role change revokes the target's refresh session so it takes effect immediately; banning an admin also revokes their session.

### Room management

- `POST /api/admin/rooms/:id/announce` — admins broadcast an announcement into a room.
- `POST /api/admin/rooms/:id/close` — admins force-close a room and clean up in-memory plus persisted data (the seed test room is exempt).

## 🎨 UI & Experience

- The console follows the site-wide cyber HUD language: terminal badges, neon outlines, glassmorphism cards.
- User role badges are color-coded: gold (super admin), cyan (admin / moderator), slate (regular user).
- Visiting `/admin` while logged out redirects to the login page and returns to the console after a successful login.

## 🧹 Bug Fixes & Security

- Added the missing `.role-badge-user` style definition for regular-user role badges.
- The initial-admin bootstrap removes the fixed-default-password design, eliminating the "compromised out of the box" risk.
- Role and ban actions are written to the audit log for traceability.
- Expanded regression coverage: new cases for initial-admin bootstrap, registration privilege escalation and role safety boundaries (server tests 92 → **94**, client 22 — all passing).

## 📥 Download & Install

| Platform | File | Architecture | Size | Notes |
|---|---|---|---|---|
| 🪟 Windows desktop | [jukeboxroom-desktop-setup-0.0.13-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.13/jukeboxroom-desktop-setup-0.0.13-x64.exe) | x64 | ≈149 MB | NSIS installer with an embedded local server — no Node.js required |
| 🤖 Android | [jukeboxroom-android-0.0.13-debug.apk](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.13/jukeboxroom-android-0.0.13-debug.apk) | universal (arm64 etc.) | ≈38 MB | Standalone music player — no server address needed |

> 💡 Web / self-hosted users don't need an installer: pull the source or deploy with Docker. See the [README](https://github.com/yuchen0x1/JukeboxRoom#readme) and [deployment guide](docs/DEPLOY.md).

## ⬆️ Upgrade Notes

- **Windows desktop**: run the installer to upgrade in place — user data and music-source credentials are preserved. If Windows SmartScreen appears, verify the download came from this project's GitHub Release before choosing "Run anyway" (builds are not code-signed with a commercial certificate).
- **Android**: install the APK and allow installation from unknown sources if prompted. Installing over an existing version keeps favorites and local playlists.
- **Self-hosted (source / Docker)**: pull the latest code and restart the service as usual; **configure `ADMIN_INIT_USERNAME` / `ADMIN_INIT_PASSWORD` before enabling the console**, and remove them after the first super admin exists.

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

- v0.0.12 → v0.0.13: <https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.12...v0.0.13>
- Full history: [CHANGELOG.md](CHANGELOG.md) and the [Releases page](https://github.com/yuchen0x1/JukeboxRoom/releases).

## 🙏 Thanks

- Built on [Node.js](https://nodejs.org), [Express](https://expressjs.com), [Socket.IO](https://socket.io), [React](https://react.dev), [Vite](https://vite.dev), [Electron](https://www.electronjs.org), [Capacitor](https://capacitorjs.com) and more.
- Thanks to the Meting aggregation API and the upstream music platforms.
- Thanks to the community for [Issues](https://github.com/yuchen0x1/JukeboxRoom/issues) and feedback in the QQ group.
