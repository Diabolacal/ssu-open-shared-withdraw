# AGENTS.md — ssu-open-shared-withdraw operating guide for AI agents

Canonical, tool-neutral contract for this repo. `CLAUDE.md` is a thin bridge that points here.
`README.md` is the product/architecture reference (on-chain design, deployment IDs, URL
parameters, in-game verification notes) — read it before touching Move or transaction code.

## What this repo is

A minimal EVE Frontier Smart Storage Unit dApp: a shared open shelf where the unit's main hangar
IS the shelf. Two halves:

- `move/ssu_open_claim/` — a Move extension package built **directly against the world package**
  (v0 `storage_unit` module, `testnet_stillness`). This repo is the estate's heaviest direct
  world-contracts consumer; upstream contract changes (e.g. the v1 rewrite on world-contracts
  `dev`) break it first.
- `app/` — Vite + React + `@evefrontier/dapp-kit`; reads via public Sui GraphQL, deployed to
  Cloudflare Pages (`ssu-open-shared-withdraw.pages.dev`; deploy from `app/` with wrangler).

## Hard rules

1. **Never call `freeze_extension_config`** — it is one-way and permanently bricks extension
   swaps on a unit.
2. A StorageUnit has ONE extension slot (`swap_or_fill`): authorizing this dApp replaces any
   other dApp's witness. Keep the owner-facing warning before replacing a foreign extension.
3. The witness identity is anchored to the **v1 original package id** (never changes across
   upgrades). Upgrades: `sui client upgrade`, then copy the new `published-at` from
   `move/ssu_open_claim/Published.toml` into `VITE_CLAIM_PACKAGE_ID` and redeploy the app.
   Current IDs: README "Current testnet deployment".
4. All `VITE_*` values are public browser config — never put secrets in one.
5. Gates before commit: `pnpm --dir app build` and `sui move test --path move/ssu_open_claim`.
6. Production deploy only on explicit operator instruction; a push or merge is not permission.
7. Preserve unrelated dirty-tree work; never run destructive git cleanup.
8. `move/ssu_open_claim/Move.toml` depends on the world package via a **relative path into the
   sui-playground repo** (`../../../sui-playground/vendor/world-contracts/contracts/world`).
   Updating that submodule in sui-playground (e.g. to the v1 `dev` branch) breaks THIS repo's
   Move build with no commit here — coordinate vendor bumps across both repos.

## The repo estate (sibling repositories)

The operator runs one product family across a fixed set of local repos. When a prompt says "my
other repos", "check the other repositories", or names a sibling product, these are the paths.
Cross-repo reads are always fine; cross-repo edits are fine when the task calls for them — commit
them in that repo, following its own `AGENTS.md`. This block is maintained as an identical copy in
every listed repo's `AGENTS.md`; if you change it, update all copies.

| Repo | Path | What it is |
|---|---|---|
| EF-Map | `C:\EF-Map-main` | Flagship map app (ef-map.com) + Cloudflare Worker. The hub: owns the shared Hetzner VPS estate (`docs/dev/vps-services.md`), the discovery estate describing every sibling product (features.html, landing pages, llms.txt), and the game-client extraction tooling (`tools/client-diff/`, `tools/game-data-extractor/`) that RootFit data refreshes depend on. |
| ef-map-overlay | `C:\ef-map-overlay` | Native Windows helper + DX12 in-game overlay for EF-Map. |
| CivilizationControl | `C:\dev\CivilizationControl` | Tribe governance app + Open Market, served at ef-map.com/civ-control/ via EF-Map's reverse proxy. Shares the VPS (Sui indexer/enrichment). Vendors world-contracts. |
| RootFit | `C:\dev\rootfit` | Ship-fitting planner at ef-map.com/fit/ (same reverse-proxy pattern). Its module/dogma data is extracted with EF-Map-repo tooling — "run our client diff" happens in `C:\EF-Map-main`. |
| frontier-commerce | `C:\dev\frontier-commerce` | Open-source Sui commerce/payment platform (Move + SDK + gas station + indexer). Infrastructure, not an app. |
| frontier-commerce-internal | `C:\dev\frontier-commerce-internal` | Private ops repo for the operator's frontier-commerce deployments (EF-Map Intelligence): deployment state, custody, ops scripts. |
| sui-playground | `C:\dev\sui-playground` | Sui/chain experiments + vendored upstream reference submodules (`vendor/world-contracts`, `vendor/evevault`, `vendor/builder-scaffold`, `vendor/builder-documentation`) — the place to fetch and inspect upstream contract branches. |
| ssu-open-shared-withdraw | `C:\dev\ssu-open-shared-withdraw` | SSU shared-shelf dApp: Move extension package (`move/ssu_open_claim`) built directly against the world package, plus a React app. Heaviest direct world-contracts consumer. |

Cross-cutting facts:

- The Hetzner VPS (`ssh ef-map-vps`) is shared: EF-Map owns it, CivilizationControl legitimately
  edits parts of it. Read `C:\EF-Map-main\docs\dev\vps-services.md` before diagnosing anything there.
- Agent memory is per-repo. For cross-cutting issues (VPS, Sui chain/RPC, Cloudflare), check both
  shared decision logs: `C:\EF-Map-main\docs\decision-log.md` and
  `C:\dev\CivilizationControl\docs\decision-log.md`.
- EVE Frontier's upstream `world-contracts` is vendored as a read-only submodule in sui-playground
  and CivilizationControl. A v1 rewrite is in progress on its `dev` branch (modular
  core/character/inventory packages replacing the v0 monolith, MVR deploys, new access control) —
  expect breaking changes for every chain consumer when it ships.

## Operator communication

The operator dictates prompts via WhisperTyping; the machine-global agent context
(`C:\Users\micha\.claude\CLAUDE.md`) carries the vocabulary corrections and conventions. If intent
is genuinely unclear, ask before starting.

## Closeout

End every task with: repo, branch, starting commit, final commit, pushed (yes/no), production deploy (yes/no), preview deploy (yes/no) + preview URL if relevant, files changed, validation run, known gaps, and preserved unrelated dirt + final `git status`.
