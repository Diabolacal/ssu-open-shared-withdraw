import type { Bucket, InventoryEntry, UnitState } from "./unitState";
import { CLAIM_AUTH_PACKAGE_ID, CLAIM_MODULE } from "./config";

/**
 * Canned unit for `?demo=1`: lets anyone preview the interface (and lets us
 * screenshot it) without a wallet, a character, or chain access.
 */

export const DEMO_TYPE_NAMES: Record<number, string> = {
  83818: "Fossilized Exotronics",
  77803: "Silicon Dust",
  77801: "Nickel-Iron Veins",
  77805: "Platinum-Group Veins",
  89258: "Hydrocarbon Residue",
  88235: "Feldspar Crystal Shards",
  84182: "Reinforced Alloys",
  84210: "Carbon Weave",
  88561: "Thermal Composites",
  88335: "D1 Fuel",
  92422: "Brine",
  88764: "Salvaged Materials",
  83892: "Luminalis",
  83894: "Radiantium",
  82126: "Coilgun Ammo 1 (S)",
  81656: "EM Disintegrator Charge (S)",
};

const DEMO_CHARACTER = {
  id: "0xdem0c8a7ac7e7",
  name: "Wend",
  ownerCapId: "0xdem0cap",
};

function entry(typeId: number, quantity: number, volume: number): InventoryEntry {
  return { typeId, quantity, volume };
}

function bucket(entries: InventoryEntry[], maxCapacity: number): Bucket {
  const usedCapacity = entries.reduce(
    (sum, e) => sum + e.quantity * e.volume,
    0,
  );
  return { entries: [...entries].sort((a, b) => a.typeId - b.typeId), usedCapacity, maxCapacity };
}

const store = {
  main: [
    entry(83818, 44, 500),
    entry(77803, 52120, 10),
    entry(77801, 45038, 10),
    entry(77805, 12150, 10),
    entry(89258, 7777, 10),
    entry(88235, 3175, 10),
    entry(84182, 14, 1000),
    entry(84210, 2, 1500),
    entry(88561, 38, 1000),
    entry(88335, 3960, 28),
    entry(92422, 364, 10),
    entry(88764, 2, 100),
    entry(83892, 63, 100),
    entry(83894, 31, 100),
  ],
  own: [entry(82126, 3000, 1), entry(81656, 6, 25)],
};

export function demoCharacter() {
  return DEMO_CHARACTER;
}

export function fetchDemoUnitState(): UnitState {
  return {
    unit: {
      id: "0xdem0551a9e0417",
      name: "Demo Freeport",
      online: true,
      ownerCapId: "0xdem00wnercap",
      extensionType: `${CLAIM_AUTH_PACKAGE_ID.slice(2)}::${CLAIM_MODULE}::ClaimAuth`,
      itemId: "1000000000000",
      tenant: "stillness",
      ownerCharacterId: "0xdem00wner",
    },
    main: bucket(store.main, 2_000_000),
    own: bucket(store.own, 2_000_000),
  };
}

function move(
  from: InventoryEntry[],
  to: InventoryEntry[],
  typeId: number,
  quantity: number,
) {
  const source = from.find((e) => e.typeId === typeId);
  if (!source || source.quantity < quantity) {
    throw new Error("Insufficient quantity in inventory");
  }
  source.quantity -= quantity;
  if (source.quantity === 0) from.splice(from.indexOf(source), 1);
  const target = to.find((e) => e.typeId === typeId);
  if (target) {
    target.quantity += quantity;
  } else {
    to.push(entry(typeId, quantity, source.volume));
  }
}

/** Simulates the take/put transactions against the canned store. */
export async function applyDemoAction(
  action: "take" | "put",
  typeId: number,
  quantity: number,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 650));
  if (action === "take") move(store.main, store.own, typeId, quantity);
  else move(store.own, store.main, typeId, quantity);
}
