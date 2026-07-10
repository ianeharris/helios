# CLAUDE.md — Helios / Solar

> This file lives at `~/Solar/CLAUDE.md` in the project repo. It is the entry point for every Claude Code session on this project.
> Last updated: 2026-05-30

---

## What this project is

**Helios** is a self-hosted, single-household home automation platform. The 28 Bradgate deployment is the reference installation. It sits above the existing vendor apps (Hue, Sonos, Hikvision, Fox ESS, Texecom, Hive) and provides a single sophisticated control surface on macOS, iOS and iPadOS. Local-first. No cloud dependency. No recurring subscriptions.

The project folder on disk is `Solar`. The name Helios is chosen because solar energy from the house PV system is a first-class concern of the platform.

Owner: Ian Harris (ianharris64@gmail.com)

---

## Read the vault notes before doing anything else

The Helios vault notes are the authoritative record for project status, phase progress, architecture decisions, risks and vendor integration detail. They are iCloud-synced and available on every Mac.

**At the start of every session, read these files in order before doing anything else:**

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Personal Obsidian vault/03 - Personal/Home/Helios/Helios.md
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Personal Obsidian vault/03 - Personal/Home/Helios/Helios - Delivery Plan.md
```

If starting work on a specific system, also read the relevant section of:

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Personal Obsidian vault/03 - Personal/Home/Helios/Helios - Vendor Integrations.md
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Personal Obsidian vault/03 - Personal/Home/Helios/Helios - Risks and Open Questions.md
```

These notes tell you exactly what phase we are in, what is done, what is pending, and what the next steps are. Do not guess or infer from the code alone — the vault is the source of truth for status.

**At the end of every session**, update the Delivery Plan note with any phase status changes. Do not update this CLAUDE.md with status — the vault is the single source of truth.

---

## Tech stack (static)

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript / Node.js | Full-stack TS |
| Frontend | React PWA | Served by Caddy; installable on iPhone/iPad |
| Internal bus | MQTT (Mosquitto) | All adapters publish/subscribe here |
| Database | Postgres + TimescaleDB | Device model + time-series energy data |
| Secrets | SOPS + age | No plaintext .env files ever |
| Container runtime | OrbStack | On Mac mini; lighter than Docker Desktop on Apple Silicon |
| Reverse proxy / auth | Caddy + Authelia | HTTPS, SSO for the dashboard |
| Camera relay | go2rtc | Hikvision RTSP → WebRTC / HLS for browser |
| Observability | Prometheus + Grafana | Per-adapter metrics; included in Compose stack |
| CI/CD | GitHub Actions | Lint → test → build → SSH deploy to Mac mini |
| Native shell (Phase 6) | Tauri 2 | Optional post-launch; PWA-first for now |

---

## Infrastructure

| Role | Machine | Address |
|---|---|---|
| Compute / always-on host | M1 Mac mini (`m1-mac-mini`) | Tailscale `100.127.66.15`, LAN `192.168.86.102` |
| Storage / backup target | Synology DS415play | Tailscale `100.69.42.15`, LAN `192.168.86.4` |
| Remote access | Tailscale tailnet | All devices on the same tailnet (Google identity: ianharris64@gmail.com) |

**Deployment target is always the Mac mini.** All `docker compose` commands that affect production run there.

**Network**: LAN subnet `192.168.86.0/24`, gateway `192.168.86.254` (TP-Link Archer BE550).

Key LAN IPs for adapter configuration:
- Hue Bridge "Bradgate": `192.168.86.199`
- Hue Bridge "Bradgate 2": `192.168.86.248`
- Texecom SmartCom: DHCP (set a static reservation before Phase 4)

---

## Model selection — read this and apply it every session

The project uses three Claude models. Match the model to the work.

| Model | When |
|---|---|
| `claude-sonnet-4-6` | Default for everything: implementation, tests, UI, refactors, docs, day-to-day code |
| `claude-opus-4-8` | Architecture decisions, hard debugging (especially Hive/Beekeeper), Phase 5 rules engine design, novel problems. Released 2026-05-28; supersedes 4.7 for Opus-tier work. |
| `claude-opus-4-7` | Fallback if 4.8 unavailable |
| `claude-haiku-4-5-20251001` | Explore subagents: scoped lookups, "find every reference to X", mechanical edits |

**Operating rules:**

1. At the start of each session, state which model is appropriate for the work ahead. If a switch is needed, ask Ian: *"This is implementation work — Sonnet is right. If you're on Opus, switch with `/model claude-sonnet-4-6`."*
2. When an Opus moment arises mid-session (hard debugging, design decision), flag it explicitly with the reason and ask Ian to switch.
3. When the Opus moment is over, proactively suggest returning to Sonnet.
4. Subagents are dispatched at the appropriate model without asking — Haiku for Explore, Sonnet for Plan and code-review.

**Per-phase defaults:**

| Phase | Driver | Promote to Opus 4.8 when |
|---|---|---|
| 0 Foundations | Sonnet | Almost never |
| 1 Lighting + audio | Sonnet | Almost never |
| 2 Energy | Sonnet | API responses confuse Sonnet |
| 3 Heating | Sonnet / Opus 4.8 for debugging | Beekeeper misbehaves |
| 4 Security | Sonnet | SIA-IP or ISAPI parsing issues |
| 5 Rules engine | **Opus 4.8 for design**, Sonnet for code | Always design rules engine with Opus 4.8 |
| 6 Native shell | Sonnet | Almost never |

---

## Agent team pattern (four roles)

| Role | Model | When used |
|---|---|---|
| Main thread | Sonnet (Opus when needed) | Always — Ian talks to this |
| Explore subagent | Haiku | Scoped lookups: "find every reference to X", "is there a library for Z" |
| Plan subagent | Sonnet | Starting a new phase — produce a step-by-step plan for review before code is written |
| Code review subagent | Sonnet, fresh context | Before merging any substantial change — independent second pair of eyes |

End-of-phase code review by a fresh Sonnet subagent in its own context is mandatory before moving to the next phase.

---

## Hard constraints

- **Zero recurring subscriptions** for build or runtime. All components are free/OSS or already paid for.
- **No secrets in plaintext** — SOPS + age only. Never in `.env` files, never in vault notes.
- **Tailscale only for remote access** — no public internet exposure.
- **Mac mini is the deployment target** — clients (MacBook Air, iPhone, iPad) never run the stack.

---

## Repo structure (key paths)

```
~/Solar/
  CLAUDE.md                        # This file
  secrets.yaml                     # SOPS-encrypted secrets (committed, never plaintext)
  .sops.yaml                       # age key recipient config
  adapters/
    hue/                           # Philips Hue CLIP API v2, multi-bridge SSE
    sonos/                         # Sonos local SOAP/UPnP (stub)
    foxess/                        # Fox ESS Open API (stub)
    hive/                          # Hive Beekeeper cloud API (stub)
    hikvision/                     # Hikvision ISAPI + go2rtc (stub)
    texecom/                       # Texecom SmartCom SIA-IP (stub)
  apps/
    api/                           # Fastify REST + WebSocket API
    web/                           # React PWA (Vite)
  packages/
    shared/                        # Shared TypeScript types
  infra/
    compose/
      docker-compose.yml           # Full stack definition
      init-db/
        001_schema.sql             # Initial Postgres schema
        002_scenes_and_mode.sql    # Scenes, house_mode, device role/tags
      caddy/                       # Caddyfile
      authelia/                    # Authelia config
      mosquitto/                   # Mosquitto config
      grafana/                     # Grafana provisioning
      prometheus/                  # Prometheus config
      secrets/                     # SOPS-decrypted secret files (gitignored)
    launchd/                       # macOS launchd plists (nightly NAS backup)
    scripts/                       # Deploy and maintenance scripts
  .github/
    workflows/                     # CI/CD: lint → test → build → SSH deploy
```

---

## What is NOT in this file

- Phase status and progress — read the vault Delivery Plan note
- Decisions log — read the vault Helios hub note
- Risk register — read the vault Risks and Open Questions note
- Vendor integration detail — read the vault Vendor Integrations note
- Architecture diagrams — read the vault Architecture and Stack note

Vault base path: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Personal Obsidian vault/03 - Personal/Home/Helios/`
