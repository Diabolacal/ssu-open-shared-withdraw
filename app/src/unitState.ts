import { blake2b } from "@noble/hashes/blake2.js";
import { bcs } from "@mysten/sui/bcs";
import { deriveObjectID, normalizeSuiAddress } from "@mysten/sui/utils";
import { SUI_GRAPHQL_URL, WORLD_PACKAGE_ID } from "./config";
import { asRecord } from "./objectReaders";

export interface InventoryEntry {
  typeId: number;
  quantity: number;
  /** Per-unit volume in on-chain units (m3 * VOLUME_SCALE). */
  volume: number;
}

export interface Bucket {
  entries: InventoryEntry[];
  usedCapacity: number;
  maxCapacity: number;
}

export interface UnitInfo {
  id: string;
  name?: string;
  online: boolean;
  ownerCapId?: string;
  /** Normalized authorized extension type, or null when none. */
  extensionType: string | null;
  itemId?: string;
  tenant?: string;
  /** Character object that holds the unit's OwnerCap (the owner). */
  ownerCharacterId?: string;
}

export interface UnitState {
  unit: UnitInfo;
  /** Main hangar = the shared shelf. */
  main?: Bucket;
  /** Legacy open inventory (v2 of this dApp); merged into the shelf. */
  open?: Bucket;
  /** The connected character's own slot in this unit. */
  own?: Bucket;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mirrors world::storage_unit::open_storage_key_from_id:
 * blake2b256( bcs(storage_unit_id) ++ b"open_inventory" ).
 */
export function openStorageKey(storageUnitId: string): string {
  const idBytes = hexToBytes(normalizeSuiAddress(storageUnitId));
  const suffix = new TextEncoder().encode("open_inventory");
  const data = new Uint8Array(idBytes.length + suffix.length);
  data.set(idBytes);
  data.set(suffix, idBytes.length);
  const digest = blake2b(data, { dkLen: 32 });
  return normalizeSuiAddress(`0x${bytesToHex(digest)}`);
}

export async function gql(query: string, variables: Record<string, unknown>) {
  const response = await fetch(SUI_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`chain read failed (${response.status})`);
  const body = (await response.json()) as {
    data?: unknown;
    errors?: { message?: string }[];
  };
  if (body.errors?.length) {
    throw new Error(body.errors[0]?.message || "chain read failed");
  }
  return body.data as Record<string, unknown> | undefined;
}

const UNIT_QUERY = `
query UnitWithFields($id: SuiAddress!, $after: String) {
  object(address: $id) {
    asMoveObject {
      contents { json }
      dynamicFields(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          name { json }
          value { ... on MoveValue { json } }
        }
      }
    }
  }
}`;

// OwnerCaps are transferred to the character OBJECT (transfer-to-object),
// which this schema reports as AddressOwner with the character id as address.
const CAP_OWNER_QUERY = `
query CapOwner($id: SuiAddress!) {
  object(address: $id) {
    owner {
      __typename
      ... on AddressOwner { address { address } }
    }
  }
}`;

// Known Stillness cycle-6 registry; used if the type query ever comes back empty.
const OBJECT_REGISTRY_FALLBACK =
  "0xf6aed9361acc0d7021672b653ebe9dae45d88e11fecef01cc5434c8f60ae764f";

const REGISTRY_QUERY = `
query Registry($type: String!) {
  objects(filter: { type: $type } first: 1) {
    nodes { address }
  }
}`;

let registryAddress: string | undefined;

async function getRegistryAddress(): Promise<string> {
  if (registryAddress) return registryAddress;
  try {
    const data = await gql(REGISTRY_QUERY, {
      type: `${WORLD_PACKAGE_ID}::object_registry::ObjectRegistry`,
    });
    const nodes = asRecord(asRecord(data?.objects))?.nodes;
    const first = Array.isArray(nodes) ? asRecord(nodes[0]) : undefined;
    registryAddress =
      typeof first?.address === "string"
        ? first.address
        : OBJECT_REGISTRY_FALLBACK;
  } catch {
    registryAddress = OBJECT_REGISTRY_FALLBACK;
  }
  return registryAddress;
}

/**
 * The in-game browser passes ?itemId=<numeric in-game id>&tenant=<tenant>.
 * The matching Sui object id is a pure derivation:
 * deriveObjectID(registry, TenantItemId type, bcs{id, tenant}).
 */
export async function resolveItemIdToObjectId(
  itemId: string,
  tenant: string,
): Promise<string> {
  const registry = await getRegistryAddress();
  const key = bcs
    .struct("TenantItemId", { id: bcs.u64(), tenant: bcs.string() })
    .serialize({ id: BigInt(itemId), tenant })
    .toBytes();
  return deriveObjectID(
    registry,
    `${WORLD_PACKAGE_ID}::in_game_id::TenantItemId`,
    key,
  );
}

function parseBucket(valueJson: unknown): Bucket | undefined {
  const inventory = asRecord(valueJson);
  if (!inventory) return undefined;
  const items = asRecord(inventory.items);
  const contents = Array.isArray(items?.contents) ? items.contents : [];

  const entries: InventoryEntry[] = [];
  for (const pair of contents) {
    const record = asRecord(pair);
    const value = asRecord(record?.value);
    const typeId = Number(record?.key ?? value?.type_id);
    const quantity = Number(value?.quantity);
    const volume = Number(value?.volume ?? 0);
    if (Number.isFinite(typeId) && Number.isFinite(quantity) && quantity > 0) {
      entries.push({ typeId, quantity, volume });
    }
  }
  entries.sort((a, b) => a.typeId - b.typeId);
  return {
    entries,
    usedCapacity: Number(inventory.used_capacity ?? 0),
    maxCapacity: Number(inventory.max_capacity ?? 0),
  };
}

/** Cap id -> owning character id; owner never changes, cache for the session. */
const capOwnerCache = new Map<string, string | undefined>();

async function resolveCapOwner(capId: string): Promise<string | undefined> {
  if (capOwnerCache.has(capId)) return capOwnerCache.get(capId);
  let owner: string | undefined;
  try {
    const data = await gql(CAP_OWNER_QUERY, { id: capId });
    const ownerNode = asRecord(asRecord(data?.object)?.owner);
    const address = asRecord(ownerNode?.address);
    owner =
      typeof address?.address === "string"
        ? normalizeSuiAddress(address.address)
        : undefined;
  } catch {
    owner = undefined;
  }
  // Only cache hits; a transient failure should be retried on the next poll.
  if (owner) capOwnerCache.set(capId, owner);
  return owner;
}

/**
 * Reads the StorageUnit object plus its inventory buckets in one paginated
 * GraphQL walk: the main hangar (shared shelf), the legacy open inventory,
 * and the caller's own slot when their character OwnerCap id is known.
 */
export async function fetchUnitState(
  storageUnitId: string,
  characterOwnerCapId?: string,
): Promise<UnitState> {
  const unitId = normalizeSuiAddress(storageUnitId);
  const openKey = openStorageKey(unitId);
  const ownKey = characterOwnerCapId
    ? normalizeSuiAddress(characterOwnerCapId)
    : undefined;

  let unitJson: Record<string, unknown> | undefined;
  const buckets = new Map<string, Bucket>();
  let after: string | null = null;

  for (;;) {
    const data = await gql(UNIT_QUERY, { id: unitId, after });
    const moveObject = asRecord(asRecord(data?.object)?.asMoveObject);
    if (!moveObject) throw new Error("storage unit not found on chain");
    unitJson ??= asRecord(asRecord(moveObject.contents)?.json);

    const fields = asRecord(moveObject.dynamicFields);
    const nodes = Array.isArray(fields?.nodes) ? fields.nodes : [];
    for (const node of nodes) {
      const record = asRecord(node);
      const nameJson = asRecord(record?.name)?.json;
      if (typeof nameJson !== "string") continue;
      const bucket = parseBucket(asRecord(record?.value)?.json);
      if (bucket) buckets.set(normalizeSuiAddress(nameJson), bucket);
    }

    const pageInfo = asRecord(fields?.pageInfo);
    if (pageInfo?.hasNextPage && typeof pageInfo.endCursor === "string") {
      after = pageInfo.endCursor;
    } else {
      break;
    }
  }

  const metadata = asRecord(unitJson?.metadata);
  const status = asRecord(asRecord(unitJson?.status)?.status);
  const key = asRecord(unitJson?.key);
  const ownerCapId =
    typeof unitJson?.owner_cap_id === "string"
      ? normalizeSuiAddress(unitJson.owner_cap_id)
      : undefined;
  const extension =
    typeof unitJson?.extension === "string" && unitJson.extension.length > 0
      ? unitJson.extension
      : null;

  const unit: UnitInfo = {
    id: unitId,
    name:
      typeof metadata?.name === "string" && metadata.name.length > 0
        ? metadata.name
        : undefined,
    online: status?.["@variant"] === "ONLINE",
    ownerCapId,
    extensionType: extension,
    itemId: typeof key?.item_id === "string" ? key.item_id : undefined,
    tenant: typeof key?.tenant === "string" ? key.tenant : undefined,
    ownerCharacterId: ownerCapId ? await resolveCapOwner(ownerCapId) : undefined,
  };

  return {
    unit,
    main: ownerCapId ? buckets.get(ownerCapId) : undefined,
    open: buckets.get(openKey),
    own: ownKey ? buckets.get(ownKey) : undefined,
  };
}
