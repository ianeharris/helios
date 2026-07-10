# Helios

Self-hosted home automation platform. The Bradgate deployment is the reference instance, combining Hue, Sonos, Hikvision, Fox ESS, Texecom and Hive behind one control surface for macOS, iOS and iPadOS.

## Current status

Helios production runs on the M1 Mac mini (`m1-mac-mini`, Tailscale `100.127.66.15`, LAN `192.168.86.102`) via OrbStack and Docker Compose. The repo is `ianeharris/Solar` and the canonical checkout path is `~/Solar`.

As of 2026-07-09, the local tree has WS-A foundation work in progress: shared adapter runtime, API command publishing, API WebSocket stream, adapter health/metrics, Hue discovery snapshots, registry upserts, event writes, stream-backed Energy hooks and a registry-backed Rooms screen. These commits are local until pushed and deployed.

## Self-hosted model

Helios is one private household installation per deployment. Device access, vendor credentials, room data and automation rules remain inside that household's own network and encrypted configuration. The core is designed to be portable, but packaged distribution is a later milestone after the Bradgate reference installation is a trusted daily driver.

## Mac mini setup checklist

### Prerequisites

- [ ] OrbStack installed on the Mac mini (`brew install orbstack`)
- [ ] Homebrew installed (`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`)
- [ ] SOPS installed (`brew install sops`)
- [ ] age installed (`brew install age`)
- [ ] GitHub CLI installed (`brew install gh`)

### One-time setup on the Mac mini

```bash
# 1. Clone the repo
gh repo clone ianeharris/Solar ~/Solar

# 2. Generate the age keypair (do this ONCE; keep the key safe)
mkdir -p ~/.config/helios
age-keygen -o ~/.config/helios/age.key
# The public key is printed to stdout - copy it into .sops.yaml and commit

# 3. Back up the age key to the NAS (encrypted vault, not the helios share)
#    Do this immediately. If you lose age.key, all secrets are unrecoverable.

# 4. Create your initial secrets file
cp infra/secrets/secrets.yaml.example infra/secrets/secrets.yaml
# Edit the file, fill in real values, then encrypt:
sops --encrypt --in-place infra/secrets/secrets.yaml
git add infra/secrets/secrets.yaml && git commit -m "Add encrypted secrets"

# 5. Add NAS backup credentials to macOS Keychain (used by backup-db.sh)
security add-internet-password -a helios -s 192.168.86.4 -w <helios_nas_smb_password>

# 6. Install the backup launchd job
mkdir -p ~/Solar/logs
cp infra/launchd/com.helios.backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.helios.backup.plist

# 7. Add GitHub Secrets for CI/CD
#    MAC_MINI_HOST    - Tailscale IP: 100.127.66.15
#    MAC_MINI_USER    - ian
#    MAC_MINI_SSH_KEY - contents of ~/.ssh/id_ed25519 (generate if needed)
gh secret set MAC_MINI_HOST --body "100.127.66.15"
gh secret set MAC_MINI_USER --body "ian"
gh secret set MAC_MINI_SSH_KEY < ~/.ssh/id_ed25519

# 8. First deploy
cd ~/Solar/infra/compose
bash ../../infra/scripts/decrypt-secrets.sh
export HELIOS_VERSION=<immutable-image-tag>
docker compose up -d
docker compose ps
```

The GitHub Actions token publishes the installation's immutable image tags to GHCR with workflow-scoped `packages: write` permission. No long-lived GHCR token is required.

### Verify Phase 0 exit criteria

```bash
# All services healthy
docker compose ps

# Login via Authelia works
open https://helios.lan

# Health endpoint (no auth)
curl https://helios.lan/health
```

## Deployment versions

CI builds and deploys the enabled service images with the immutable Git commit SHA. For a manual rollback on the Mac mini, set `HELIOS_VERSION` to the earlier deployed SHA, then run `docker compose up -d --force-recreate` from `infra/compose`.

## Project structure

```
Solar/
  apps/
    api/          Node.js/TypeScript API (Fastify REST + WebSocket)
    web/          React PWA (Vite)
  adapters/
    hue/          Philips Hue Bridge v2 adapter (Phase 1)
    sonos/        Sonos local SOAP/UPnP adapter (Phase 1)
    hikvision/    Hikvision ISAPI + go2rtc (Phase 4)
    foxess/       Fox ESS Open API adapter (Phase 2)
    texecom/      Texecom Premier Elite / SmartCom adapter (Phase 4)
    hive/         Hive adapter stub; HA Core bridge is the primary planned path
  packages/
    shared/       Shared TypeScript types used across all packages
    adapter-sdk/  Shared adapter runtime: MQTT, secrets, health, metrics
  infra/
    compose/      Docker Compose stack (prod and staging)
    secrets/      SOPS-encrypted secrets (committed; plaintext never committed)
    scripts/      deploy, decrypt, backup scripts
    launchd/      macOS launchd plists for scheduled tasks
  .github/
    workflows/    GitHub Actions CI/CD
```

## Delivery phases

| Phase | Content | Status |
|-------|---------|--------|
| 0 | Foundations: repo, Compose stack, CI/CD, secrets, backup | Complete |
| WS-A | Hardening: adapter SDK, API commands, stream, registry, tests, CI cleanup | In progress |
| 1 / WS-B | Lighting (Hue) and audio (Sonos) | In progress |
| 2 / WS-C | Energy (Fox ESS, Octopus) | In progress |
| 3 | Heating (Hive) | Pending |
| 4 | Security: Hikvision cameras + Texecom alarm | Pending |
| 5 | Automation engine + notifications + polish | Pending |
| 6 | Native shell, widgets, Siri (optional) | Backlog |

Full plan: `03 - Personal/Home/Helios/Helios - Implementation Plan 2026-07.md` in the Obsidian vault, with the older delivery-plan note retained for history.
