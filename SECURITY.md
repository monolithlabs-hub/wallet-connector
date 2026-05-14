# Security Policy

## Supported Versions

Security fixes are issued for the latest minor of each published package. Older minors do not receive backports — upgrade to the latest release line before reporting.

| Package                                  | Status       |
| ---------------------------------------- | ------------ |
| `@monolithlabs-hub/wallet-connect-core`  | Latest minor |
| `@monolithlabs-hub/wallet-connect-ui`    | Latest minor |
| `@monolithlabs-hub/wallet-connect-react` | Latest minor |
| `@monolithlabs-hub/wallet-connect-vue`   | Latest minor |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security reports.** Public issues, pull requests, and discussions are indexed and exposed to scrapers immediately — that's the wrong channel for a vulnerability that has not yet been patched.

Use **GitHub Security Advisories** instead:

1. Go to the repository's `Security` tab.
2. Click `Report a vulnerability`.
3. Fill out the private advisory form.

This opens a private thread visible only to the reporter and the maintainers. We coordinate the fix, the release, and (when warranted) the CVE assignment from there.

If GitHub Security Advisories is unavailable for any reason, open a minimal public issue titled `Security contact request` with no technical details — a maintainer will reach out privately to set up an alternate channel.

## What to Include

A useful report contains:

- **Affected version(s)** — exact `package.json` version of every affected package, plus the consuming framework (React / Vue) version if relevant.
- **Reproduction** — minimal repro steps or a code snippet. A failing test case is ideal.
- **Impact** — what an attacker can do (e.g., session hijack, key disclosure, phishing assist, denial of service). Include the threat model: what permissions or position does the attacker need?
- **Suggested remediation** — optional, but appreciated.

## Response Timeline

- **Acknowledgment**: best-effort within 72 hours.
- **Triage**: confirmed or rejected with reasoning within 7 days.
- **Fix or status update**: within 30 days for confirmed issues, with longer windows negotiated explicitly when complexity warrants it.

We will keep you informed throughout and credit you in the advisory and release notes unless you request otherwise.

## Coordinated Disclosure

We ask reporters to refrain from public disclosure until a patched release is available and the advisory is published. We will request a CVE through GitHub's flow when an issue warrants one.

If you must disclose on a fixed deadline (e.g., a paid bug bounty timeline elsewhere), say so in the initial report so we can coordinate.

## Scope

**In scope:**

- Cryptographic flaws in ephemeral keypair generation, deep-link URL construction, or callback decryption (see `packages/core/src/adapters/`).
- Session/state persistence flaws that leak or extend the lifetime of sensitive material in `sessionStorage` / `localStorage` (see `packages/core/src/session/`).
- Injection (XSS, URL injection, prototype pollution) reachable through the public API of any of the four published packages.
- Authentication bypass in the SIWS flow.
- Any `Math.random` or other non-CSPRNG usage in code paths that produce key material, nonces, or session identifiers.

**Out of scope:**

- Vulnerabilities in third-party wallet apps (Phantom, Solflare, Backpack, Glow, etc.) — report those to the respective vendor.
- Vulnerabilities in upstream dependencies (`tweetnacl`, `bs58`, `@wallet-standard/*`, etc.) unless the issue is in how this library uses them — report the underlying issue to the upstream maintainer.
- Issues in the example apps under `examples/`, which are not published and not intended for production.
- Issues in the test suites or build tooling.
- Social engineering, phishing of end users, or attacks requiring physical access to the user's device.
- Denial of service through resource exhaustion of a single user's browser tab (the attack surface is per-tab).

## Hall of Fame

Contributors who report valid vulnerabilities will be listed here once advisories are published.
