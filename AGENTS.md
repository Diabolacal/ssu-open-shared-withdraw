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

## Operator communication

The operator dictates prompts via WhisperTyping; his machine-global agent context carries the
vocabulary corrections and conventions. If intent is genuinely unclear, ask before starting.

## Portfolio control plane

Portfolio-level state for this maintainer's projects is tracked in a private control-plane
repository, `Diabolacal/project-control`. Agents with access to it should read its record for
this project and its `NOW.md` before substantial work, and add a factual handoff there at
closeout when work materially changes project status. This repository's own code and docs remain
the authority for implementation detail. Do not copy private portfolio information, machine
paths, or secrets into this public repository.

## Closeout

End every task with: repo, branch, starting commit, final commit, pushed (yes/no), production deploy (yes/no), preview deploy (yes/no) + preview URL if relevant, files changed, validation run, known gaps, and preserved unrelated dirt + final `git status`.
