export const WORLD_PACKAGE_ID =
  import.meta.env.VITE_WORLD_PACKAGE_ID ||
  "0x8b8a46ed766fa1358ce7c5c51f6a164b13d627a63e45343f69ed0ba0446c1aa1";

export const CLAIM_PACKAGE_ID = import.meta.env.VITE_CLAIM_PACKAGE_ID || "";

export const CLAIM_MODULE = import.meta.env.VITE_CLAIM_MODULE || "claim";

export function isConfiguredPackageId(packageId: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(packageId) && packageId !== "0x0";
}

