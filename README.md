# @monolithlabs/wallet-connect

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)

Solana wallet-connect monorepo. See [`.doc/PLAN.md`](.doc/PLAN.md) for the architecture and roadmap.

> The badge URL above uses `OWNER/REPO` as a placeholder. Replace it with the actual GitHub `<owner>/<repo>` slug once the remote is provisioned (TASK-703). The full README lands in TASK-604.

## Theming the modal

`<ConnectButton>` reads every visual value from a CSS custom property with an inline `var(--wc-foo, fallback)` fallback. Set the variable on `:root`, on `[role="dialog"]`, on `[data-wc-modal]`, or on any ancestor — the cascade flows through. Hover and focus-visible rules are injected once into `<head>` by `attachModal()` from `@monolithlabs/wallet-connect-ui`.

| Variable             | Default                          | Where it applies                         |
| -------------------- | -------------------------------- | ---------------------------------------- |
| `--wc-bg`            | `#fff`                           | Dialog background                        |
| `--wc-fg`            | `#111`                           | Dialog foreground (text)                 |
| `--wc-accent`        | `#5b5bd6`                        | Focus-visible outline                    |
| `--wc-muted-fg`      | `rgba(0, 0, 0, 0.6)`             | Close button, "Connecting…" status text  |
| `--wc-border`        | `rgba(0, 0, 0, 0.08)`            | Header divider, disconnect button border |
| `--wc-radius`        | `12px`                           | Dialog border-radius                     |
| `--wc-radius-item`   | `8px`                            | Wallet rows, close button, badges        |
| `--wc-backdrop`      | `rgba(0, 0, 0, 0.5)`             | Modal backdrop                           |
| `--wc-shadow`        | `0 20px 40px rgba(0, 0, 0, 0.3)` | Dialog box-shadow                        |
| `--wc-badge-bg`      | `rgba(0, 0, 0, 0.08)`            | "Get" / "Install" badge background       |
| `--wc-badge-fg`      | `inherit`                        | "Get" / "Install" badge text             |
| `--wc-detected-bg`   | `rgba(34, 197, 94, 0.12)`        | "Detected" badge background              |
| `--wc-detected-fg`   | `rgb(21, 128, 61)`               | "Detected" badge text                    |
| `--wc-item-hover-bg` | `rgba(0, 0, 0, 0.04)`            | Wallet row hover, close button hover     |
| `--wc-error-bg`      | `rgba(220, 38, 38, 0.08)`        | Error row background                     |
| `--wc-error-fg`      | `rgb(185, 28, 28)`               | Error row text                           |
| `--wc-font-size`     | `14px`                           | Body text                                |
| `--wc-title-size`    | `18px`                           | Modal title                              |

Dark-mode example:

```css
:root {
  --wc-bg: #0f1115;
  --wc-fg: #f5f5f7;
  --wc-muted-fg: rgba(255, 255, 255, 0.6);
  --wc-border: rgba(255, 255, 255, 0.08);
  --wc-badge-bg: rgba(255, 255, 255, 0.08);
  --wc-detected-bg: rgba(34, 197, 94, 0.18);
  --wc-detected-fg: rgb(74, 222, 128);
  --wc-item-hover-bg: rgba(255, 255, 255, 0.06);
}
```
