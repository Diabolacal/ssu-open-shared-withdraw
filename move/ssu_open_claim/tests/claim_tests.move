#[test_only]
module ssu_open_claim::claim_tests;

use std::{string::{String, utf8}, unit_test::assert_eq};
use sui::{clock, test_scenario as ts};
use world::{
    access::{AdminACL, OwnerCap},
    character::{Self, Character},
    energy::EnergyConfig,
    network_node::{Self, NetworkNode},
    object_registry::ObjectRegistry,
    storage_unit::{Self, StorageUnit},
    test_helpers::{Self, admin, governor, tenant, user_a, user_b},
};
use ssu_open_claim::claim;

const CHARACTER_A_ITEM_ID: u32 = 1234;
const CHARACTER_B_ITEM_ID: u32 = 5678;
const LOCATION_A_HASH: vector<u8> =
    x"7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b";
const STORAGE_A_TYPE_ID: u64 = 5555;
const STORAGE_A_ITEM_ID: u64 = 90002;
const MAX_CAPACITY: u64 = 100000;
const AMMO_TYPE_ID: u64 = 88069;
const AMMO_ITEM_ID: u64 = 1000004145107;
const AMMO_VOLUME: u64 = 100;
const AMMO_QUANTITY: u32 = 10;
const NWN_TYPE_ID: u64 = 111000;
const NWN_ITEM_ID: u64 = 5000;
const FUEL_MAX_CAPACITY: u64 = 1000;
const FUEL_BURN_RATE_IN_MS: u64 = 3600 * 1000;
const MAX_PRODUCTION: u64 = 100;
const FUEL_TYPE_ID: u64 = 1;
const FUEL_VOLUME: u64 = 10;

#[test]
fun claim_moves_open_inventory_to_callers_owned_inventory() {
    let mut scenario = ts::begin(governor());
    setup_world(&mut scenario);
    let owner_character_id = create_character(&mut scenario, user_a(), CHARACTER_A_ITEM_ID);
    let claimer_character_id = create_character(&mut scenario, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut scenario, owner_character_id);

    online_storage_unit(&mut scenario, user_a(), owner_character_id, storage_id, nwn_id);
    mint_ammo(&mut scenario, storage_id, owner_character_id);
    authorize_extension(&mut scenario, owner_character_id, storage_id);
    stock_open(&mut scenario, owner_character_id, storage_id);

    let claimer_owner_cap_id = character_owner_cap_id(&mut scenario, claimer_character_id);
    ts::next_tx(&mut scenario, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        let claimer = ts::take_shared_by_id<Character>(&scenario, claimer_character_id);
        claim::claim_from_open(
            &mut storage_unit,
            &claimer,
            AMMO_TYPE_ID,
            AMMO_QUANTITY,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(storage_unit);
        ts::return_shared(claimer);
    };

    ts::next_tx(&mut scenario, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        assert_eq!(
            storage_unit::item_quantity(&storage_unit, claimer_owner_cap_id, AMMO_TYPE_ID),
            AMMO_QUANTITY,
        );
        assert!(
            !storage_unit::contains_item(
                &storage_unit,
                storage_unit.open_storage_key(),
                AMMO_TYPE_ID,
            ),
        );
        ts::return_shared(storage_unit);
    };
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = 0, location = ssu_open_claim::claim)]
fun claim_rejects_someone_elses_character() {
    let mut scenario = ts::begin(governor());
    setup_world(&mut scenario);
    let owner_character_id = create_character(&mut scenario, user_a(), CHARACTER_A_ITEM_ID);
    let claimer_character_id = create_character(&mut scenario, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut scenario, owner_character_id);

    online_storage_unit(&mut scenario, user_a(), owner_character_id, storage_id, nwn_id);
    mint_ammo(&mut scenario, storage_id, owner_character_id);
    authorize_extension(&mut scenario, owner_character_id, storage_id);
    stock_open(&mut scenario, owner_character_id, storage_id);

    ts::next_tx(&mut scenario, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        let claimer = ts::take_shared_by_id<Character>(&scenario, claimer_character_id);
        claim::claim_from_open(
            &mut storage_unit,
            &claimer,
            AMMO_TYPE_ID,
            AMMO_QUANTITY,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(storage_unit);
        ts::return_shared(claimer);
    };
    ts::end(scenario);
}

#[test]
fun share_moves_owned_inventory_to_open_and_other_player_claims() {
    let mut scenario = ts::begin(governor());
    setup_world(&mut scenario);
    let owner_character_id = create_character(&mut scenario, user_a(), CHARACTER_A_ITEM_ID);
    let sharer_character_id = create_character(&mut scenario, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut scenario, owner_character_id);

    online_storage_unit(&mut scenario, user_a(), owner_character_id, storage_id, nwn_id);
    authorize_extension(&mut scenario, owner_character_id, storage_id);

    // Player B (not the SSU owner) bridges ammo into their own owned/ephemeral
    // slot, then shares it into the open inventory.
    mint_ammo_to_owned(&mut scenario, storage_id, sharer_character_id, user_b());
    share_to_open(&mut scenario, sharer_character_id, storage_id, user_b());

    let sharer_owner_cap_id = character_owner_cap_id(&mut scenario, sharer_character_id);
    ts::next_tx(&mut scenario, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        assert_eq!(
            storage_unit::item_quantity(
                &storage_unit,
                storage_unit.open_storage_key(),
                AMMO_TYPE_ID,
            ),
            AMMO_QUANTITY,
        );
        assert!(!storage_unit::contains_item(&storage_unit, sharer_owner_cap_id, AMMO_TYPE_ID));
        ts::return_shared(storage_unit);
    };

    // Player A (a different wallet) claims the shared items into their own slot.
    let claimer_owner_cap_id = character_owner_cap_id(&mut scenario, owner_character_id);
    ts::next_tx(&mut scenario, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        let claimer = ts::take_shared_by_id<Character>(&scenario, owner_character_id);
        claim::claim_from_open(
            &mut storage_unit,
            &claimer,
            AMMO_TYPE_ID,
            AMMO_QUANTITY,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(storage_unit);
        ts::return_shared(claimer);
    };

    ts::next_tx(&mut scenario, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        assert_eq!(
            storage_unit::item_quantity(&storage_unit, claimer_owner_cap_id, AMMO_TYPE_ID),
            AMMO_QUANTITY,
        );
        assert!(
            !storage_unit::contains_item(
                &storage_unit,
                storage_unit.open_storage_key(),
                AMMO_TYPE_ID,
            ),
        );
        ts::return_shared(storage_unit);
    };
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = 1, location = ssu_open_claim::claim)]
fun share_rejects_zero_quantity() {
    let mut scenario = ts::begin(governor());
    setup_world(&mut scenario);
    let owner_character_id = create_character(&mut scenario, user_a(), CHARACTER_A_ITEM_ID);
    let sharer_character_id = create_character(&mut scenario, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut scenario, owner_character_id);

    online_storage_unit(&mut scenario, user_a(), owner_character_id, storage_id, nwn_id);
    authorize_extension(&mut scenario, owner_character_id, storage_id);
    mint_ammo_to_owned(&mut scenario, storage_id, sharer_character_id, user_b());

    ts::next_tx(&mut scenario, user_b());
    let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
    let mut character = ts::take_shared_by_id<Character>(&scenario, sharer_character_id);
    let (owner_cap, receipt) = character.borrow_owner_cap<Character>(
        ts::most_recent_receiving_ticket<OwnerCap<Character>>(&sharer_character_id),
        ts::ctx(&mut scenario),
    );
    claim::share_to_open(
        &mut storage_unit,
        &character,
        &owner_cap,
        AMMO_TYPE_ID,
        0,
        ts::ctx(&mut scenario),
    );
    character.return_owner_cap(owner_cap, receipt);
    ts::return_shared(storage_unit);
    ts::return_shared(character);
    ts::end(scenario);
}

#[test]
fun take_moves_main_hangar_to_callers_owned_inventory() {
    let mut scenario = ts::begin(governor());
    setup_world(&mut scenario);
    let owner_character_id = create_character(&mut scenario, user_a(), CHARACTER_A_ITEM_ID);
    let taker_character_id = create_character(&mut scenario, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut scenario, owner_character_id);

    online_storage_unit(&mut scenario, user_a(), owner_character_id, storage_id, nwn_id);
    mint_ammo(&mut scenario, storage_id, owner_character_id);
    authorize_extension(&mut scenario, owner_character_id, storage_id);

    let taker_owner_cap_id = character_owner_cap_id(&mut scenario, taker_character_id);
    ts::next_tx(&mut scenario, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        let taker = ts::take_shared_by_id<Character>(&scenario, taker_character_id);
        claim::take(
            &mut storage_unit,
            &taker,
            AMMO_TYPE_ID,
            AMMO_QUANTITY,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(storage_unit);
        ts::return_shared(taker);
    };

    ts::next_tx(&mut scenario, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        assert_eq!(
            storage_unit::item_quantity(&storage_unit, taker_owner_cap_id, AMMO_TYPE_ID),
            AMMO_QUANTITY,
        );
        assert!(
            !storage_unit::contains_item(
                &storage_unit,
                storage_unit.owner_cap_id(),
                AMMO_TYPE_ID,
            ),
        );
        ts::return_shared(storage_unit);
    };
    ts::end(scenario);
}

#[test]
#[expected_failure(abort_code = 0, location = ssu_open_claim::claim)]
fun take_rejects_someone_elses_character() {
    let mut scenario = ts::begin(governor());
    setup_world(&mut scenario);
    let owner_character_id = create_character(&mut scenario, user_a(), CHARACTER_A_ITEM_ID);
    let taker_character_id = create_character(&mut scenario, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut scenario, owner_character_id);

    online_storage_unit(&mut scenario, user_a(), owner_character_id, storage_id, nwn_id);
    mint_ammo(&mut scenario, storage_id, owner_character_id);
    authorize_extension(&mut scenario, owner_character_id, storage_id);

    // user_a signs but passes user_b's character: must abort.
    ts::next_tx(&mut scenario, user_a());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        let taker = ts::take_shared_by_id<Character>(&scenario, taker_character_id);
        claim::take(
            &mut storage_unit,
            &taker,
            AMMO_TYPE_ID,
            AMMO_QUANTITY,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(storage_unit);
        ts::return_shared(taker);
    };
    ts::end(scenario);
}

#[test]
fun put_moves_owned_inventory_to_main_hangar() {
    let mut scenario = ts::begin(governor());
    setup_world(&mut scenario);
    let owner_character_id = create_character(&mut scenario, user_a(), CHARACTER_A_ITEM_ID);
    let sharer_character_id = create_character(&mut scenario, user_b(), CHARACTER_B_ITEM_ID);
    let (storage_id, nwn_id) = create_storage_unit(&mut scenario, owner_character_id);

    online_storage_unit(&mut scenario, user_a(), owner_character_id, storage_id, nwn_id);
    authorize_extension(&mut scenario, owner_character_id, storage_id);

    // Player B (not the SSU owner) deposits into their own slot in game, then
    // puts the items on the shared shelf (the main hangar).
    mint_ammo_to_owned(&mut scenario, storage_id, sharer_character_id, user_b());
    let sharer_owner_cap_id = character_owner_cap_id(&mut scenario, sharer_character_id);
    ts::next_tx(&mut scenario, user_b());
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        let mut character = ts::take_shared_by_id<Character>(&scenario, sharer_character_id);
        let (owner_cap, receipt) = character.borrow_owner_cap<Character>(
            ts::most_recent_receiving_ticket<OwnerCap<Character>>(&sharer_character_id),
            ts::ctx(&mut scenario),
        );
        claim::put(
            &mut storage_unit,
            &character,
            &owner_cap,
            AMMO_TYPE_ID,
            AMMO_QUANTITY,
            ts::ctx(&mut scenario),
        );
        character.return_owner_cap(owner_cap, receipt);
        ts::return_shared(storage_unit);
        ts::return_shared(character);
    };

    ts::next_tx(&mut scenario, admin());
    {
        let storage_unit = ts::take_shared_by_id<StorageUnit>(&scenario, storage_id);
        assert_eq!(
            storage_unit::item_quantity(
                &storage_unit,
                storage_unit.owner_cap_id(),
                AMMO_TYPE_ID,
            ),
            AMMO_QUANTITY,
        );
        assert!(!storage_unit::contains_item(&storage_unit, sharer_owner_cap_id, AMMO_TYPE_ID));
        ts::return_shared(storage_unit);
    };
    ts::end(scenario);
}

fun setup_world(scenario: &mut ts::Scenario) {
    test_helpers::setup_world(scenario);
    test_helpers::configure_assembly_energy(scenario);
}

fun create_character(scenario: &mut ts::Scenario, user: address, item_id: u32): ID {
    create_character_with_tenant(scenario, user, item_id, tenant())
}

fun create_character_with_tenant(
    scenario: &mut ts::Scenario,
    user: address,
    item_id: u32,
    tenant_name: String,
): ID {
    ts::next_tx(scenario, admin());
    let admin_acl = ts::take_shared<AdminACL>(scenario);
    let mut registry = ts::take_shared<ObjectRegistry>(scenario);
    let character = character::create_character(
        &mut registry,
        &admin_acl,
        item_id,
        tenant_name,
        100,
        user,
        utf8(b"name"),
        ts::ctx(scenario),
    );
    let character_id = object::id(&character);
    character.share_character(&admin_acl, ts::ctx(scenario));
    ts::return_shared(registry);
    ts::return_shared(admin_acl);
    character_id
}

fun create_network_node(scenario: &mut ts::Scenario, character_id: ID): ID {
    ts::next_tx(scenario, admin());
    let mut registry = ts::take_shared<ObjectRegistry>(scenario);
    let character = ts::take_shared_by_id<Character>(scenario, character_id);
    let admin_acl = ts::take_shared<AdminACL>(scenario);
    let nwn = network_node::anchor(
        &mut registry,
        &character,
        &admin_acl,
        NWN_ITEM_ID,
        NWN_TYPE_ID,
        LOCATION_A_HASH,
        FUEL_MAX_CAPACITY,
        FUEL_BURN_RATE_IN_MS,
        MAX_PRODUCTION,
        ts::ctx(scenario),
    );
    let nwn_id = object::id(&nwn);
    nwn.share_network_node(&admin_acl, ts::ctx(scenario));
    ts::return_shared(character);
    ts::return_shared(admin_acl);
    ts::return_shared(registry);
    nwn_id
}

fun create_storage_unit(scenario: &mut ts::Scenario, character_id: ID): (ID, ID) {
    let nwn_id = create_network_node(scenario, character_id);
    ts::next_tx(scenario, admin());
    let mut registry = ts::take_shared<ObjectRegistry>(scenario);
    let mut nwn = ts::take_shared_by_id<NetworkNode>(scenario, nwn_id);
    let character = ts::take_shared_by_id<Character>(scenario, character_id);
    let admin_acl = ts::take_shared<AdminACL>(scenario);
    let storage_unit = storage_unit::anchor(
        &mut registry,
        &mut nwn,
        &character,
        &admin_acl,
        STORAGE_A_ITEM_ID,
        STORAGE_A_TYPE_ID,
        MAX_CAPACITY,
        LOCATION_A_HASH,
        ts::ctx(scenario),
    );
    let storage_id = object::id(&storage_unit);
    storage_unit.share_storage_unit(&admin_acl, ts::ctx(scenario));
    ts::return_shared(admin_acl);
    ts::return_shared(character);
    ts::return_shared(registry);
    ts::return_shared(nwn);
    (storage_id, nwn_id)
}

fun online_storage_unit(
    scenario: &mut ts::Scenario,
    user: address,
    character_id: ID,
    storage_id: ID,
    nwn_id: ID,
) {
    let clock = clock::create_for_testing(ts::ctx(scenario));
    ts::next_tx(scenario, user);
    let mut character = ts::take_shared_by_id<Character>(scenario, character_id);
    let (nwn_owner_cap, nwn_receipt) = character.borrow_owner_cap<NetworkNode>(
        ts::most_recent_receiving_ticket<OwnerCap<NetworkNode>>(&character_id),
        ts::ctx(scenario),
    );

    ts::next_tx(scenario, user);
    {
        let mut nwn = ts::take_shared_by_id<NetworkNode>(scenario, nwn_id);
        nwn.deposit_fuel_test(&nwn_owner_cap, FUEL_TYPE_ID, FUEL_VOLUME, 10, &clock);
        ts::return_shared(nwn);
    };

    ts::next_tx(scenario, user);
    {
        let mut nwn = ts::take_shared_by_id<NetworkNode>(scenario, nwn_id);
        nwn.online(&nwn_owner_cap, &clock);
        ts::return_shared(nwn);
    };
    character.return_owner_cap(nwn_owner_cap, nwn_receipt);

    ts::next_tx(scenario, user);
    {
        let mut storage_unit = ts::take_shared_by_id<StorageUnit>(scenario, storage_id);
        let mut nwn = ts::take_shared_by_id<NetworkNode>(scenario, nwn_id);
        let energy_config = ts::take_shared<EnergyConfig>(scenario);
        let (storage_owner_cap, storage_receipt) = character.borrow_owner_cap<StorageUnit>(
            ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&character_id),
            ts::ctx(scenario),
        );
        storage_unit.online(&mut nwn, &energy_config, &storage_owner_cap);
        character.return_owner_cap(storage_owner_cap, storage_receipt);
        ts::return_shared(storage_unit);
        ts::return_shared(nwn);
        ts::return_shared(energy_config);
    };

    ts::return_shared(character);
    clock.destroy_for_testing();
}

fun mint_ammo(scenario: &mut ts::Scenario, storage_id: ID, character_id: ID) {
    ts::next_tx(scenario, user_a());
    let mut character = ts::take_shared_by_id<Character>(scenario, character_id);
    let (owner_cap, receipt) = character.borrow_owner_cap<StorageUnit>(
        ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&character_id),
        ts::ctx(scenario),
    );
    let mut storage_unit = ts::take_shared_by_id<StorageUnit>(scenario, storage_id);
    storage_unit.game_item_to_chain_inventory_test<StorageUnit>(
        &character,
        &owner_cap,
        AMMO_ITEM_ID,
        AMMO_TYPE_ID,
        AMMO_VOLUME,
        AMMO_QUANTITY,
        ts::ctx(scenario),
    );
    character.return_owner_cap(owner_cap, receipt);
    ts::return_shared(character);
    ts::return_shared(storage_unit);
}

fun authorize_extension(scenario: &mut ts::Scenario, character_id: ID, storage_id: ID) {
    ts::next_tx(scenario, user_a());
    let mut storage_unit = ts::take_shared_by_id<StorageUnit>(scenario, storage_id);
    let mut character = ts::take_shared_by_id<Character>(scenario, character_id);
    let (owner_cap, receipt) = character.borrow_owner_cap<StorageUnit>(
        ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&character_id),
        ts::ctx(scenario),
    );
    claim::authorize(&mut storage_unit, &owner_cap);
    character.return_owner_cap(owner_cap, receipt);
    ts::return_shared(storage_unit);
    ts::return_shared(character);
}

fun stock_open(scenario: &mut ts::Scenario, character_id: ID, storage_id: ID) {
    ts::next_tx(scenario, user_a());
    let mut storage_unit = ts::take_shared_by_id<StorageUnit>(scenario, storage_id);
    let mut character = ts::take_shared_by_id<Character>(scenario, character_id);
    let (owner_cap, receipt) = character.borrow_owner_cap<StorageUnit>(
        ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&character_id),
        ts::ctx(scenario),
    );
    claim::stock_open(
        &mut storage_unit,
        &character,
        &owner_cap,
        AMMO_TYPE_ID,
        AMMO_QUANTITY,
        ts::ctx(scenario),
    );
    character.return_owner_cap(owner_cap, receipt);
    ts::return_shared(storage_unit);
    ts::return_shared(character);
}

/// Bridges ammo into the character's own owned/ephemeral inventory in the SSU
/// (keyed by the character's OwnerCap id), as the in-game deposit does.
fun mint_ammo_to_owned(
    scenario: &mut ts::Scenario,
    storage_id: ID,
    character_id: ID,
    user: address,
) {
    ts::next_tx(scenario, user);
    let mut character = ts::take_shared_by_id<Character>(scenario, character_id);
    let (owner_cap, receipt) = character.borrow_owner_cap<Character>(
        ts::most_recent_receiving_ticket<OwnerCap<Character>>(&character_id),
        ts::ctx(scenario),
    );
    let mut storage_unit = ts::take_shared_by_id<StorageUnit>(scenario, storage_id);
    storage_unit.game_item_to_chain_inventory_test<Character>(
        &character,
        &owner_cap,
        AMMO_ITEM_ID,
        AMMO_TYPE_ID,
        AMMO_VOLUME,
        AMMO_QUANTITY,
        ts::ctx(scenario),
    );
    character.return_owner_cap(owner_cap, receipt);
    ts::return_shared(character);
    ts::return_shared(storage_unit);
}

fun share_to_open(scenario: &mut ts::Scenario, character_id: ID, storage_id: ID, user: address) {
    ts::next_tx(scenario, user);
    let mut storage_unit = ts::take_shared_by_id<StorageUnit>(scenario, storage_id);
    let mut character = ts::take_shared_by_id<Character>(scenario, character_id);
    let (owner_cap, receipt) = character.borrow_owner_cap<Character>(
        ts::most_recent_receiving_ticket<OwnerCap<Character>>(&character_id),
        ts::ctx(scenario),
    );
    claim::share_to_open(
        &mut storage_unit,
        &character,
        &owner_cap,
        AMMO_TYPE_ID,
        AMMO_QUANTITY,
        ts::ctx(scenario),
    );
    character.return_owner_cap(owner_cap, receipt);
    ts::return_shared(storage_unit);
    ts::return_shared(character);
}

fun character_owner_cap_id(scenario: &mut ts::Scenario, character_id: ID): ID {
    ts::next_tx(scenario, admin());
    let character = ts::take_shared_by_id<Character>(scenario, character_id);
    let owner_cap_id = character.owner_cap_id();
    ts::return_shared(character);
    owner_cap_id
}
