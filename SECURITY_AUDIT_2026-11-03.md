# Security Audit and Release Readiness

Audit date: 2026-11-03

## Scope and Method

Reviewed the tracked source and deployment configuration for the Node.js/Express/Socket.IO server, React/Vite client, desktop/mobile wrappers, authentication and authorization, file streaming, outbound URL handling, Docker Compose, repository secret tracking, and dependency audit. Ran the repository's `npm run check`, `npm audit --json`, Git tracking checks, and `docker compose config --quiet`. No external site or production system was tested.

This is evidence-bounded static and automated testing, not a penetration test or a guarantee of security. The working tree was clean before audit; no source-level vulnerability with a confirmed exploit path was found, so no runtime behavior was changed.

## Architecture and Boundaries

- Client: React 19, TypeScript, Vite; Capacitor for mobile and Electron for desktop packaging.
- Server: Node.js 20+, Express 5, Socket.IO 4, JSON-file persistence with optional Redis.
- Authentication: scrypt password hashes, HMAC-SHA256 access JWTs, rotating opaque refresh tokens stored by hash; HTTP role middleware protects administrative/library/task routes.
- Realtime authorization: room membership and mutation checks are enforced by server-side room-domain functions; read-only sessions are rejected for mutation events.
- Outbound requests: HTTP(S)-only URL validation, private/reserved address rejection, DNS validation/pinning in the safe-fetch layer, and redirect validation in media proxy flows.
- Local files: library streaming resolves real paths and confines them to configured roots.
- Uploads: chat image uploads use scoped, time-limited Qiniu credentials rather than accepting arbitrary server-side file uploads.
- Deployment: Docker image, Compose, PM2 and documented reverse-proxy setups. JSON data and generated secrets are excluded from Git.

## Findings and Remediation

### Confirmed issues

No confirmed exploitable authentication, authorization, path traversal, or outbound URL validation issue was established in the inspected execution paths. No code fix was justified by available evidence.

### Release-process gap fixed

- Finding: repository had no dedicated security vulnerability reporting policy.
- Impact: reporters had no documented private channel or deployment baseline.
- Fix: added `SECURITY.md` with private-reporting guidance, supported-version scope, and deployment security requirements.
- Verification: file presence and content reviewed; no executable tests apply.

### Deployment hardening observations

- Docker currently runs as the base image's root user. This was not changed because user IDs and bind-mounted data-volume permissions need an explicit deployment migration/compatibility test. For public deployments, run behind a reverse proxy with only required ports exposed and consider a non-root image configuration compatible with the mounted data directory.
- Compose binds port 4000 on all interfaces. Restrict exposure at the host firewall or bind behind a local reverse proxy where appropriate.
- Compose secret values are obvious placeholders. Production startup rejects invalid/placeholder secrets; operators must set distinct random secrets before deploying.
- Rate limits and several runtime stores are process-local. Multi-instance deployments require Redis-backed coordination or an external shared rate-limiting layer.

## Secret and Open-Source Release Checks

- Git-tracked `.env`, private keys, logs, database files, and runtime data: none found by targeted Git index checks.
- Local `server/.env` and `server/data/` are ignored, not tracked. Their contents were not copied into the report.
- Full-history Gitleaks v8.30.1 scan (all 28 commits): 2 findings, both confirmed false positives — the publicly documented NetEase Cloud Music AES preset key and Kugou web signing salt in `server/sourceResolvers.js` (commit `24b14c9d`). These are well-known public constants used by third-party music API integrations, not private credentials, so no rotation is required. Their fingerprints were added to `.gitleaksignore`; the follow-up scan completed with zero leaks.
- License: repository includes `LICENSE`; dependency license compatibility was not independently enumerated.
- Added private vulnerability disclosure guidance in `SECURITY.md`.

## Automated Test Results

Command: `npm run check`

- Server tests: 92 passed, 0 failed, 0 skipped.
- Client tests: 17 passed, 0 failed.
- TypeScript and production client build: passed; Vite reported a large Three.js vendor chunk warning.
- Production dependency audits (root/server/client): 0 vulnerabilities reported.
- Compose syntax: `docker compose config --quiet` passed.
- Additional root audit: 0 vulnerabilities reported.

## Not Verified / Remaining Risks

- No live production-like deployment, TLS proxy, Redis cluster, Qiniu bucket policy, or real provider credentials were available for validation.
- No full-history CodeQL/Semgrep/Trivy scan was run; full-history secret scanning is now covered by Gitleaks.
- No browser-based end-to-end session or multi-user security exercise was run.
- Docker non-root runtime, filesystem permissions, and port exposure remain deployment hardening work pending a tested volume ownership strategy.
- Dependency audit covers npm advisories available to the installed npm registry state at audit time; it does not assess transitive package behavior or malicious maintainer risk.
- The JSON store is intended for small single-instance deployments; production multi-instance consistency and shared rate limiting need deployment-specific verification.

## Release Recommendation

No confirmed P0/P1 blocker was found in the reviewed code paths, and the existing automated check suite passes. A source release is reasonable after maintainers review the changes and run a full-history secret scan. Public production deployment should not be considered fully hardened until operators provide non-placeholder secrets, configure exact HTTPS origins and network boundaries, and validate non-root/container volume permissions, proxy trust, and multi-instance controls for their environment.
