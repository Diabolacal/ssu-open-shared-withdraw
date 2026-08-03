# CLAUDE.md — ssu-open-shared-withdraw

**Read `AGENTS.md` first — it is the canonical contract for this repo.** This file is a thin
bridge for Claude Code and adds nothing beyond these reminders:

- `move/ssu_open_claim` builds directly against the EVE Frontier world package; **never call
  `freeze_extension_config`** (one-way) and remember a unit has one extension slot.
- `README.md` carries the on-chain design, current testnet deployment IDs, and in-game
  verification traps (e.g. the game does NOT append `?itemId=` to custom dApp URLs; a missing
  digest is not a failed transaction).
- Gates: `pnpm --dir app build` · `sui move test --path move/ssu_open_claim`.
- Production deploy only on explicit operator instruction.
