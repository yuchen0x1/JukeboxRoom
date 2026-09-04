# Changelog

## 2.0.1 - 2026-08-29

- Added automatic online update detection from the latest stable Gitee Release.
- Added update notices for the website, PWA and Capacitor remote URL clients.
- Added one-click links for the desktop deployment ZIP, Android APK and iOS IPA when published.
- Updated the PWA cache strategy to activate new static resources promptly.
- Added release asset fallback redirects for the desktop, Android and iOS download routes.

## 2.0.0 - 2026-08-13

OpenMusic 2.0 is the current stable baseline for the codebase, which remains under normal maintenance and ongoing development.

### Release Notes

- Finalized the project version as 2.0.0 across the root package, web client, server, Android, and iOS app metadata.
- Confirmed the main branch is the active integration branch for ongoing updates.
- Added the project status document at docs/PROJECT-2.0-UPGRADE-PLAN.md.
- Synchronized the frontend dependency lockfile after package version and dependency cleanup.
- Kept React on the stable 18.x line for this release to avoid React 19 peer dependency risk in the 3D and virtualized list stack.
- Updated Three.js type declarations to match the runtime Three.js version line.
- Updated the server lockfile to resolve the nanoid security advisory.

### Verification

- Frontend build: passed with npm run build.
- Server tests: passed with 46 node:test checks.
- Security audit: passed with 0 vulnerabilities for root, client, and server production dependencies.
