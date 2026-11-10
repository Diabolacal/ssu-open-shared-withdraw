/**
 * Item keys as the chain stores them.
 *
 * A storage inventory is keyed by a u64. For an item without a variant that
 * is just its type id. An item WITH a variant packs both into the one key,
 * the same way the game client does:
 *
 *   key     = (variant_id << 32) | type_id
 *   type_id = key & 0xFFFFFFFF
 *   variant = key >> 32            (0 = no variant)
 *
 * Packed keys run past 2^53, where a JS number silently rounds to a
 * DIFFERENT integer, so a key never passes through `Number()`. The app
 * carries it as a canonical decimal string from the inventory read all the
 * way to the transaction argument (`tx.pure.u64(BigInt(key))`).
 */

/** Canonical decimal string of a u64 item key (no sign, no leading zeros). */
export type ChainKey = string;

const ID_BITS = 32n;
const ID_MASK = (1n << ID_BITS) - 1n;
const U64_MAX = (1n << 64n) - 1n;

/**
 * Reads a key from chain JSON (u64 values arrive as strings) without losing
 * precision. Returns undefined for anything that is not a u64.
 */
export function parseChainKey(raw: unknown): ChainKey | undefined {
  let value: bigint;
  if (typeof raw === "bigint") {
    value = raw;
  } else if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    value = BigInt(raw.trim());
  } else if (typeof raw === "number" && Number.isSafeInteger(raw)) {
    // A number is only trusted while it is exact.
    value = BigInt(raw);
  } else {
    return undefined;
  }
  if (value < 0n || value > U64_MAX) return undefined;
  return value.toString();
}

/** The key as a bigint, for the transaction argument. Throws on a bad key. */
export function chainKeyToBigInt(key: ChainKey): bigint {
  const parsed = parseChainKey(key);
  if (parsed === undefined) throw new Error(`Not a valid item key: ${key}`);
  return BigInt(parsed);
}

/** The base type id (names, icons, volume tables). Always exact as a number. */
export function baseTypeId(key: ChainKey): number {
  return Number(chainKeyToBigInt(key) & ID_MASK);
}

/** The variant id, or 0 when the item has none. Always exact as a number. */
export function variantId(key: ChainKey): number {
  return Number(chainKeyToBigInt(key) >> ID_BITS);
}

/**
 * The player-facing label for a variant stack, in the game's own words (the
 * client labels one "variant <id>"), or undefined for a plain item.
 */
export function variantLabel(key: ChainKey): string | undefined {
  const variant = variantId(key);
  return variant ? `Variant ${variant}` : undefined;
}

/** Builds a key from its parts (tests and demo data). */
export function packChainKey(typeId: number | bigint, variant: number | bigint = 0): ChainKey {
  const base = BigInt(typeId);
  const v = BigInt(variant);
  if (base <= 0n || base > ID_MASK) throw new Error(`type id ${typeId} does not fit in a key`);
  if (v < 0n || v > ID_MASK) throw new Error(`variant id ${variant} does not fit in a key`);
  return ((v << ID_BITS) | base).toString();
}

/** Orders keys numerically (canonical strings: shorter is smaller). */
export function compareChainKeys(a: ChainKey, b: ChainKey): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}
