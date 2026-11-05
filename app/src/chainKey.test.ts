import { describe, expect, it } from "vitest";
import {
  baseTypeId,
  chainKeyToBigInt,
  compareChainKeys,
  packChainKey,
  parseChainKey,
  variantId,
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

  it("falls back to the entry's type_id when the map key is missing", () => {
    const bucket = parseBucket({
      items: { contents: [{ value: { type_id: BIG_VARIANT.toString(), quantity: 1 } }] },
    })!;
    expect(bucket.entries[0].typeId).toBe(BIG_VARIANT.toString());
  });
});
