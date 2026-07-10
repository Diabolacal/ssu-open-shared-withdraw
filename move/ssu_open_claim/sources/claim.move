module ssu_open_claim::claim;

use world::{
    access::OwnerCap,
    character::{Self, Character},
    storage_unit::{Self, StorageUnit},
};

const ENotCharacterOwner: u64 = 0;
const EInvalidQuantity: u64 = 1;

public struct ClaimAuth has drop {}

public fun authorize(
    storage_unit: &mut StorageUnit,
    owner_cap: &OwnerCap<StorageUnit>,
) {
    storage_unit::authorize_extension<ClaimAuth>(storage_unit, owner_cap);
}

public fun claim_from_open(
    storage_unit: &mut StorageUnit,
    character: &Character,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    assert!(character::character_address(character) == ctx.sender(), ENotCharacterOwner);
    assert!(quantity > 0, EInvalidQuantity);

    let item = storage_unit::withdraw_from_open_inventory<ClaimAuth>(
        storage_unit,
        character,
        ClaimAuth {},
        type_id,
        quantity,
        ctx,
    );

    storage_unit::deposit_to_owned<ClaimAuth>(
        storage_unit,
        character,
        item,
        ClaimAuth {},
        ctx,
    );
}

public fun stock_open(
    storage_unit: &mut StorageUnit,
    character: &Character,
    owner_cap: &OwnerCap<StorageUnit>,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    assert!(quantity > 0, EInvalidQuantity);

    let item = storage_unit::withdraw_by_owner<StorageUnit>(
        storage_unit,
        character,
        owner_cap,
        type_id,
        quantity,
        ctx,
    );

    storage_unit::deposit_to_open_inventory<ClaimAuth>(
        storage_unit,
        character,
        item,
        ClaimAuth {},
        ctx,
    );
}

/// Any player moves items from their own owned/ephemeral inventory in this SSU
/// into the shared open inventory, where anyone can claim them.
/// `withdraw_by_owner<Character>` enforces sender == character wallet and that
/// the cap is the character's own OwnerCap, so items can only leave the
/// caller's own slot.
public fun share_to_open(
    storage_unit: &mut StorageUnit,
    character: &Character,
    owner_cap: &OwnerCap<Character>,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    assert!(quantity > 0, EInvalidQuantity);

    let item = storage_unit::withdraw_by_owner<Character>(
        storage_unit,
        character,
        owner_cap,
        type_id,
        quantity,
        ctx,
    );

    storage_unit::deposit_to_open_inventory<ClaimAuth>(
        storage_unit,
        character,
        item,
        ClaimAuth {},
        ctx,
    );
}

// === v3: the shared shelf IS the SSU main hangar ===
//
// The owner stocks and reclaims by dragging items in/out in game (the game's
// native deposit/withdraw already targets the main hangar), so the dApp only
// has to move items between the main hangar and the caller's own slot.

/// Any player takes items from the SSU main hangar into their own
/// owned/ephemeral slot, where the game lets them drag the items out.
public fun take(
    storage_unit: &mut StorageUnit,
    character: &Character,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    assert!(character::character_address(character) == ctx.sender(), ENotCharacterOwner);
    assert!(quantity > 0, EInvalidQuantity);

    let item = storage_unit::withdraw_item<ClaimAuth>(
        storage_unit,
        character,
        ClaimAuth {},
        type_id,
        quantity,
        ctx,
    );

    storage_unit::deposit_to_owned<ClaimAuth>(
        storage_unit,
        character,
        item,
        ClaimAuth {},
        ctx,
    );
}

/// Any player moves items from their own owned/ephemeral slot into the SSU
/// main hangar, sharing them with everyone. `withdraw_by_owner<Character>`
/// enforces sender == character wallet, so items can only leave the caller's
/// own slot.
public fun put(
    storage_unit: &mut StorageUnit,
    character: &Character,
    owner_cap: &OwnerCap<Character>,
    type_id: u64,
    quantity: u32,
    ctx: &mut TxContext,
) {
    assert!(quantity > 0, EInvalidQuantity);

    let item = storage_unit::withdraw_by_owner<Character>(
        storage_unit,
        character,
        owner_cap,
        type_id,
        quantity,
        ctx,
    );

    storage_unit::deposit_item<ClaimAuth>(
        storage_unit,
        character,
        item,
        ClaimAuth {},
        ctx,
    );
}
