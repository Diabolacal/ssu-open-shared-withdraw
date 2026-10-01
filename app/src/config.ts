export const WORLD_PACKAGE_ID =
  import.meta.env.VITE_WORLD_PACKAGE_ID ||
  "0x7be18d6294e533bedd9a5d70a96ce8d9d4b87a7c74188ba65d3fe966bbed9d92";

/** Call target: the latest published-at address of ssu_open_claim. */
export const CLAIM_PACKAGE_ID = import.meta.env.VITE_CLAIM_PACKAGE_ID || "";

/**
 * Witness identity: the ORIGINAL (v1) package id. The on-chain `extension`
 * field on a StorageUnit records `ClaimAuth` under this defining id forever,
 * across upgrades of the call target above.
 */
export const CLAIM_AUTH_PACKAGE_ID =
  import.meta.env.VITE_CLAIM_AUTH_PACKAGE_ID ||
  "0x679214b103db42dd074bb454914e61b18ac881b9a9e9f121a9b318dd61c56594";

export const CLAIM_MODULE = import.meta.env.VITE_CLAIM_MODULE || "claim";

export const SUI_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

/** On-chain capacity/volume integers are cubic metres times this factor. */
export const VOLUME_SCALE = 100;

export function isConfiguredPackageId(packageId: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(packageId) && packageId !== "0x0";
}

/** `61f4da...::ssu_access::SsuAuth` -> normalized, for extension comparisons. */
export function normalizeTypeName(typeName: string): string {
  const trimmed = typeName.trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
}

export const CLAIM_AUTH_TYPE = normalizeTypeName(
  `${CLAIM_AUTH_PACKAGE_ID}::${CLAIM_MODULE}::ClaimAuth`,
);
