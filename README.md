# SSU Open Shared Withdraw

A minimal EVE Frontier Smart Storage Unit dApp for a **shared open shelf**:
any player can put items from their own slot in the SSU into the shared open
inventory, and any player can take items out of it into their own slot. The
game authenticates players with their wallet; nobody is gated.

## What is included

- `move/ssu_open_claim`: Move extension package with `ClaimAuth`, owner
  authorization, and three flows:
  - `share_to_open`: any player moves items from their own owned/ephemeral
    slot in the SSU into the shared open inventory.
  - `claim_from_open`: any player takes items from the shared open inventory
    into their own owned/ephemeral slot.
  - `stock_open`: the owner moves items from the SSU main hangar into the
    shared open inventory.
- `app`: Vite/React dApp using `@evefrontier/dapp-kit`. Black-and-white
  interface that lists the shared inventory (with player-facing item names)
  with a **Take** button per row, and the player's own items in the SSU with a
  **Put in** button per row.
- `scripts`: reserved for operator CLI helpers once live object IDs are known.

The implementation is pinned to the local `world-contracts` source in
`C:/dev/sui-playground/vendor/world-contracts` at `d1929fad...` (v0.0.24).

## How the app reads data

- Shared inventory contents: the open inventory dynamic field on the
  `StorageUnit`, keyed by `blake2b256(bcs(storage_unit_id) ++ "open_inventory")`
  (mirrors `world::storage_unit::open_storage_key_from_id`), read via the Sui
  GraphQL endpoint.
- The player's own slot: the dynamic field keyed by their character's
  `owner_cap_id`.
- Item names: `https://world-api-stillness.live.pub.evefrontier.com/v2/types/{type_id}`
  (override with `VITE_WORLD_API_HOST` on a new cycle). Note the dapp-kit
  0.1.9 `getDatahubGameInfo` host (`...live.tech...`) no longer resolves.

## Current testnet package

- Environment: `testnet_stillness`
- World package: `0x8b8a46ed766fa1358ce7c5c51f6a164b13d627a63e45343f69ed0ba0446c1aa1`
- Claim package v2 (includes `share_to_open`):
  `0x1c8593d88b32b8fb8f876ce97f70254a42dd3da570ed50dcb14836723089650c`
- Original package id (v1): `0x4defff877661097a0fdfac67a87dc6e23f37b1664cff81bb166037a34930f610`
- UpgradeCap: `0x62e423dee9a9247248489e8ff61aba08578fa24f3ee2e6427844f7a232095f05`

Future upgrades: `sui client upgrade move/ssu_open_claim`. Upgrades keep the
`ClaimAuth` witness identity (defining package ID), so SSUs that already
authorized the extension keep working without re-authorization. After
upgrading, set `VITE_CLAIM_PACKAGE_ID` in `app/.env.local` and
`app/.env.production` to the new `published-at` address recorded in
`move/ssu_open_claim/Published.toml`, then rebuild/redeploy the app.

## Local verification

```powershell
pnpm install
pnpm build
sui move build --path move/ssu_open_claim
sui move test --path move/ssu_open_claim
```

## Configure the dApp

Copy `app/.env.example` to `app/.env.local` and set or confirm:

- `VITE_CLAIM_PACKAGE_ID`: package ID after publishing/upgrading
  `ssu_open_claim`.
- `VITE_WORLD_PACKAGE_ID`: world package for the target tenant. The default is
  `testnet_stillness`.
- `VITE_WORLD_API_HOST` (optional): world API host for item-name lookups.

The in-game SSU URL should point at the deployed app. The Base dApp opens it
with `?tenant=<tenant>&itemId=<itemId>`. For local smoke tests, the app also
accepts `?storageUnitId=<object-id>&characterId=<character-id>`.

## Publish and owner setup

1. Publish (or upgrade) the Move package on `testnet_stillness`.
2. Set `VITE_CLAIM_PACKAGE_ID` to the published package ID and deploy the app.
3. Open the app as the SSU owner and use the owner panel (collapsed under
   "Owner setup") to authorize the extension.
4. Share the SSU URL. Players connect their wallet, deposit items into the SSU
   in game (their own slot), then use **Put in** to share them and **Take** to
   claim whatever anyone has shared.

Keep prototype SSUs unfrozen so the extension can be upgraded or revoked.
