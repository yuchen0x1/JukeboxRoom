# Security Policy

## Reporting a Vulnerability

Please do not report security vulnerabilities in public issues or discussions. Use GitHub's private vulnerability reporting feature for this repository. Include the affected version or commit, the impacted component, a concise description of the attack prerequisites and impact, and steps to reproduce in a local or otherwise authorized environment.

Do not include real user data, credentials, or secrets in a report. Redact sensitive values and use synthetic test data.

## Supported Versions

Security fixes are provided for the latest published release. Users should upgrade to the latest release before reporting issues where possible.

## Deployment Guidance

- Set `NODE_ENV=production` for public deployments.
- Set distinct, randomly generated values of at least 32 characters for `CLIENT_ID_SECRET` and `AUTH_JWT_SECRET`.
- Set `CLIENT_URL` to the exact HTTPS origin(s) serving the client.
- Keep the application data directory private and persistent; do not serve it as static web content.
- Put public deployments behind a TLS-terminating reverse proxy and expose only the application port required by that proxy.
- Enable `TRUST_PROXY=1` only when the immediate reverse proxy overwrites forwarded client-IP headers.
- Keep `ALLOW_PRIVATE_UPSTREAMS` disabled unless a trusted, administrator-configured private music upstream is required.
- Use Redis and an external rate-limit strategy when deploying multiple application instances; process-local limits do not coordinate across instances.
- Treat administrator credentials, music-provider credentials, Redis credentials, and object-storage keys as deployment secrets. Do not place them in source control or client bundles.
