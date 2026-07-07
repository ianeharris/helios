# Helios

Bespoke home automation platform for 28 Bradgate. Single control surface across macOS, iOS, and iPadOS, sitting above Hue, Sonos, Hikvision, Fox ESS, Texecom, and Hive.

## Phase 0 - Mac mini setup checklist

### Prerequisites

- [ ] OrbStack installed on the Mac mini (`brew install orbstack`)
- [ ] Homebrew installed (`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`)
- [ ] SOPS installed (`brew install sops`)
- [ ] age installed (`brew install age`)
- [ ] GitHub CLI installed (`brew install gh`)

### One-time setup on the Mac mini

```bash
# 1. Clone the repo
gh repo clone ianharris64/helios ~/helios

# 2. Generate the age keypair (do this ONCE; keep the key safe)
age-keygen -o ~/helios/age.key
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
mkdir -p ~/helios/logs
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
cd ~/helios/infra/compose
bash ../../infra/scripts/decrypt-secrets.sh
docker compose up -d
docker compose ps
```

### Verify Phase 0 exit criteria

```bash
# All services healthy
docker compose ps

# Login via Authelia works
open https://helios.lan

# Health endpoint (no auth)
curl https://helios.lan/health
```

## Project structure

```
Solar/
  apps/
    api/          Node.js/TypeScript API (Fastify)
    web/          React PWA (Vite)
  adapters/
    hue/          Philips Hue Bridge v2 adapter (Phase 1)
    sonos/        Sonos local SOAP/UPnP adapter (Phase 1)
    hikvision/    Hikvision ISAPI + go2rtc (Phase 4)
    foxess/       Fox ESS Open API adapter (Phase 2)
    texecom/      Texecom Premier Elite / SmartCom adapter (Phase 4)
    hive/         Hive Beekeeper API adapter (Phase 3)
  packages/
    shared/       Shared TypeScript types used across all packages
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
| 0 | Foundations: repo, Compose stack, CI/CD, secrets, backup | In progress |
| 1 | Lighting (Hue) and audio (Sonos) | Pending |
| 2 | Energy (Fox ESS, Octopus) | Pending |
| 3 | Heating (Hive) | Pending |
| 4 | Security: Hikvision cameras + Texecom alarm | Pending |
| 5 | Automation engine + notifications + polish | Pending |
| 6 | Native shell, widgets, Siri (optional) | Backlog |

Full plan: `03 - Personal/Home/Helios/Helios - Delivery Plan.md` in the Obsidian vault.
