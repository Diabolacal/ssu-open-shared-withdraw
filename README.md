# SSU Open Shared Withdraw

A minimal EVE Frontier Smart Storage Unit dApp for an owner-stocked open shelf:
players withdraw a `type_id` and quantity from the SSU open inventory into their
own owned/ephemeral slot in the same SSU.

## What is included

- `move/ssu_open_claim`: Move extension package with `ClaimAuth`, owner
  authorization, owner stocking, and player claim functions.
- `app`: Vite/React dApp using `@evefrontier/dapp-kit`.
- `scripts`: reserved for operator CLI helpers once live object IDs are known.

The implementation is pinned to the local `world-contracts` source in
`C:/dev/sui-playground/vendor/world-contracts` at `d1929fad...` (v0.0.24).

## Current testnet package

- Environment: `testnet_stillness`
- World package: `0x8b8a46ed766fa1358ce7c5c51f6a164b13d627a63e45343f69ed0ba0446c1aa1`
- Claim package: `0x4defff877661097a0fdfac67a87dc6e23f37b1664cff81bb166037a34930f610`
- Publish digest: `Csmzzwfq5qHsVpmWAKkxAYKCCBpFkEZVL9Jo51Thjdca`
- UpgradeCap: `0x62e423dee9a9247248489e8ff61aba08578fa24f3ee2e6427844f7a232095f05`

## Local verification

```powershell
pnpm install
pnpm build
sui move build --path move/ssu_open_claim
sui move test --path move/ssu_open_claim
```

## Configure the dApp

Copy `app/.env.example` to `app/.env.local` and set or confirm:

- `VITE_CLAIM_PACKAGE_ID`: package ID after publishing `ssu_open_claim`.
- `VITE_WORLD_PACKAGE_ID`: world package for the target tenant. The default is
  `testnet_stillness`.

The in-game SSU URL should point at the deployed app. The Base dApp opens it
with `?tenant=<tenant>&itemId=<itemId>`. For local smoke tests, the app also
accepts `?storageUnitId=<object-id>&characterId=<character-id>`.

## Publish and owner setup

1. Publish the Move package to `testnet_stillness`.
2. Set `VITE_CLAIM_PACKAGE_ID` to the published package ID and deploy the app.
3. Open the app as the SSU owner and use the owner panel to authorize the
   extension.
4. Use the owner panel to stock the open shelf.
5. Share the SSU URL. Other players connect their wallet and claim by `type_id`
   and quantity.

Keep prototype SSUs unfrozen so the extension can be upgraded or revoked.
