import { describe, expect, it } from "vitest";
import {
  baseTypeId,
  chainKeyToBigInt,
  compareChainKeys,
  packChainKey,
  parseChainKey,
  variantId,
  variantLabel,
} from "./chainKey";
import { parseBucket } from "./unitState";

// Invented variant ids (and the invented base type 4321): the packing rule
// is what is under test, not any real variant.
const SMALL_VARIANT = (5n << 32n) | 77800n; // 21474914280
// Above 2^53 with an odd low part, so a double cannot hold it.
const BIG_VARIANT = (3_000_000n << 32n) | 4321n;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

describe("chain keys", () => {
  it("unpacks (5 << 32) | 77800 into base type and variant", () => {
    const key = parseChainKey(SMALL_VARIANT.toString());
    expect(key).toBe("21474914280");
    expect(baseTypeId(key!)).toBe(77800);
    expect(variantId(key!)).toBe(5);
    expect(packChainKey(77800, 5)).toBe(key);
  });

  it("keeps a key above 2^53 exact, where Number() would not", () => {
    expect(BIG_VARIANT > MAX_SAFE).toBe(true);
    const raw = BIG_VARIANT.toString();
    // The old read path: Number() rounds to a different integer.
    expect(BigInt(Number(raw))).not.toBe(BIG_VARIANT);

    const key = parseChainKey(raw)!;
    expect(key).toBe(raw);
    expect(chainKeyToBigInt(key)).toBe(BIG_VARIANT);
    expect(baseTypeId(key)).toBe(4321);
    expect(variantId(key)).toBe(3_000_000);
  });

  it("leaves items without a variant unchanged", () => {
    expect(parseChainKey("77800")).toBe("77800");
    expect(baseTypeId("77800")).toBe(77800);
    expect(variantId("77800")).toBe(0);
    expect(packChainKey(77800)).toBe("77800");
  });

  it("accepts the full u64 range and nothing outside it", () => {
    const max = ((1n << 64n) - 1n).toString();
    expect(parseChainKey(max)).toBe(max);
    expect(baseTypeId(max)).toBe(0xffffffff);
    expect(variantId(max)).toBe(0xffffffff);
    expect(parseChainKey((1n << 64n).toString())).toBeUndefined();
    expect(parseChainKey("-1")).toBeUndefined();
    expect(parseChainKey("12.5")).toBeUndefined();
    expect(parseChainKey("0x10")).toBeUndefined();
    expect(parseChainKey("")).toBeUndefined();
    expect(parseChainKey(undefined)).toBeUndefined();
    expect(parseChainKey(1.5)).toBeUndefined();
    // An unsafe number has already lost precision: refuse it.
    expect(parseChainKey(Number(BIG_VARIANT))).toBeUndefined();
    expect(parseChainKey(77800)).toBe("77800");
    expect(parseChainKey(BIG_VARIANT)).toBe(BIG_VARIANT.toString());
    expect(parseChainKey("007")).toBe("7");
  });

  // Real keys from a Stillness unit after the 2026-11-10 patch, with the base
  // type and variant each one packs. Before the fix these rendered as "type N".
  it.each([
    ["133144064611", 78435, 31],
    ["665720027587", 96707, 155],
    ["1026497280448", 96704, 239],
    ["1662152440263", 96711, 387],
    ["1666447408844", 97996, 388],
    ["1670742374854", 96710, 389],
    ["1864015903175", 96711, 434],
    ["1868310871756", 97996, 435],
    ["1872605837766", 96710, 436],
  ])("decodes live key %s to type %i, variant %i", (key, base, variant) => {
    expect(parseChainKey(key)).toBe(key);
    expect(baseTypeId(key)).toBe(base);
    expect(variantId(key)).toBe(variant);
    expect(variantLabel(key)).toBe(`Variant ${variant}`);
    expect(packChainKey(base, variant)).toBe(key);
  });

  it("labels only variant stacks", () => {
    expect(variantLabel("77800")).toBeUndefined();
    expect(variantLabel(SMALL_VARIANT.toString())).toBe("Variant 5");
  });

  it("orders keys numerically", () => {
    const keys = [BIG_VARIANT.toString(), "77800", SMALL_VARIANT.toString(), "9"];
    expect([...keys].sort(compareChainKeys)).toEqual([
      "9",
      "77800",
      SMALL_VARIANT.toString(),
      BIG_VARIANT.toString(),
    ]);
  });
});

describe("inventory read", () => {
  const bucketJson = {
    max_capacity: "20000000",
    used_capacity: "1000",
    items: {
      contents: [
        { key: BIG_VARIANT.toString(), value: { type_id: BIG_VARIANT.toString(), quantity: 2, volume: "10" } },
        { key: "77800", value: { type_id: "77800", quantity: 409, volume: "10" } },
        { key: SMALL_VARIANT.toString(), value: { type_id: SMALL_VARIANT.toString(), quantity: 7, volume: "10" } },
        // Below one whole unit on chain: never offered for a move.
        { key: "4322", value: { type_id: "4322", quantity: 0, volume: "10" } },
      ],
    },
  };

  it("keeps exact keys and gives each variant its own row", () => {
    const bucket = parseBucket(bucketJson)!;
    expect(bucket.entries.map((e) => e.typeId)).toEqual([
      "77800",
      SMALL_VARIANT.toString(),
      BIG_VARIANT.toString(),
    ]);
    expect(bucket.entries.map((e) => e.quantity)).toEqual([409, 7, 2]);
    expect(bucket.usedCapacity).toBe(1000);
    expect(bucket.maxCapacity).toBe(20_000_000);
  });

  it("reads variant stacks exactly as Stillness returns them (2026-11-10)", () => {
    // Shape and values copied from a live unit's main hangar after the patch.
    const live = (key: string, quantity: number, volume: string) => ({
      key,
      value: { tenant: "stillness", type_id: key, item_id: "0", volume, quantity },
    });
    const bucket = parseBucket({
      max_capacity: "20000000",
      used_capacity: "874172",
      items: {
        contents: [
          live("1662152440263", 152300, "0"),
          live("1864015903175", 152300, "0"),
          live("133144064611", 920, "2"),
          live("77810", 6, "100"),
        ],
      },
    })!;
    expect(bucket.entries.map((e) => [e.typeId, e.quantity, e.volume])).toEqual([
      ["77810", 6, 100],
      ["133144064611", 920, 2],
      ["1662152440263", 152300, 0],
      ["1864015903175", 152300, 0],
    ]);
  });

  it("falls back to the entry's type_id when the map key is missing", () => {
    const bucket = parseBucket({
      items: { contents: [{ value: { type_id: BIG_VARIANT.toString(), quantity: 1 } }] },
    })!;
    expect(bucket.entries[0].typeId).toBe(BIG_VARIANT.toString());
  });
});
