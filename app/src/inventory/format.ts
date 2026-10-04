import { VOLUME_SCALE } from "../config";

function truncate2(value: number): string {
  return (Math.floor(value * 100) / 100).toFixed(2);
}

/**
 * Stack counts the way the game's inventory badges print them: exact with
 * thousands separators below 10,000 ("1,142"), then truncated to two decimals
 * with a suffix ("14.72K", "1.20M"). Truncating never shows more than exists.
 */
export function formatQuantity(quantity: number): string {
  if (quantity >= 1_000_000_000) return `${truncate2(quantity / 1_000_000_000)}B`;
  if (quantity >= 1_000_000) return `${truncate2(quantity / 1_000_000)}M`;
  if (quantity >= 10_000) return `${truncate2(quantity / 1_000)}K`;
  return quantity.toLocaleString("en-US");
}

/** On-chain volume units (m3 x VOLUME_SCALE) as the capacity bar's "34,322.6". */
export function formatUsedM3(units: number): string {
  return (units / VOLUME_SCALE).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Capacity totals drop a trailing ".0", like the game's "200,000". */
export function formatMaxM3(units: number): string {
  return (units / VOLUME_SCALE).toLocaleString("en-US", {
    maximumFractionDigits: 1,
  });
}
