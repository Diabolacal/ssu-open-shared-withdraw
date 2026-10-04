import type { Bucket, InventoryEntry, UnitState } from "./unitState";
import { CLAIM_AUTH_PACKAGE_ID, CLAIM_MODULE } from "./config";

/**
 * Canned unit for `?demo=1`: lets anyone preview the interface (and lets us
 * screenshot it) without a wallet, a character, or chain access. Names come
 * from the bundled type-name map; icons from public/icons when present.
 */

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
  // Copies, so React state never shares objects the simulator mutates.
  const copies = entries.map((e) => ({ ...e })).sort((a, b) => a.typeId - b.typeId);
  return { entries: copies, usedCapacity, maxCapacity };
}

const store = {
  main: [
    entry(78448, 27, 1000),
    entry(78449, 5, 1000),
    entry(78447, 70, 1000),
    entry(77810, 222, 1000),
    entry(92414, 29, 100),
    entry(92394, 1, 100),
    entry(77800, 409, 1000),
    entry(78446, 48, 1000),
    entry(95779, 33, 25),
    entry(77518, 8, 25),
    entry(81658, 21, 25),
    entry(95339, 7, 100),
    entry(78516, 14721, 28),
    entry(83818, 5, 500),
    entry(72244, 8, 100),
    entry(99003, 35, 100),
    entry(99020, 20, 100),
    entry(99014, 2, 100),
    entry(88765, 39, 100),
    entry(89089, 119, 100),
    entry(84210, 300, 1500),
    entry(88781, 141, 100),
    entry(88564, 1, 100),
    entry(88783, 1142, 10),
    entry(99001, 832, 10),
    entry(84180, 40, 100),
    entry(89258, 661, 10),
    entry(89260, 212, 10),
    entry(77805, 1800, 10),
    entry(83892, 4, 100),
    entry(83894, 1, 100),
  ],
  own: [
    entry(95343, 11, 100),
    entry(84182, 266, 1000),
    entry(88561, 376, 1000),
    entry(92422, 60, 10),
    entry(77803, 51810, 10),
    entry(95659, 1, 50000),
  ],
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
    main: bucket(store.main, 20_000_000),
    own: bucket(store.own, 2_500_000),
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

type DemoLine = { typeId: number; quantity: number };

/** Simulates one batched move transaction against the canned store. */
export async function applyDemoMoves(takes: DemoLine[], shares: DemoLine[]): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 650));
  for (const line of shares) move(store.own, store.main, line.typeId, line.quantity);
  for (const line of takes) move(store.main, store.own, line.typeId, line.quantity);
}
