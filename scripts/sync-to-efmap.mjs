// Builds the dApp with base=/storage/ and copies it into the EF-Map repo's
// public folder, so ef-map.com/storage/<unit id> serves this app.
//
//   node scripts/sync-to-efmap.mjs
//
// Override the EF-Map checkout with EFMAP_DIR if it isn't at C:\EF-Map-main.
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(repoRoot, "app");
const distDir = path.join(appDir, "dist-efmap");
const efmapDir = process.env.EFMAP_DIR || "C:/EF-Map-main";
const target = path.join(efmapDir, "eve-frontier-map", "public", "storage");

if (!existsSync(path.join(efmapDir, "eve-frontier-map"))) {
  console.error(`EF-Map checkout not found at ${efmapDir} (set EFMAP_DIR).`);
  process.exit(1);
}

// The production copy must carry the item icons (gitignored game art).
if (!existsSync(path.join(appDir, "public", "icons.json")) && !process.env.ALLOW_NO_ICONS) {
  console.error(
    "app/public/icons.json is missing: generate the item icons from the game client first " +
      "(or set ALLOW_NO_ICONS=1 to sync a build with blank tiles).",
  );
  process.exit(1);
}

console.log("building with base=/storage/ …");
execSync("pnpm build:efmap", { cwd: appDir, stdio: "inherit" });

console.log(`copying ${distDir} -> ${target}`);
rmSync(target, { recursive: true, force: true });
cpSync(distDir, target, { recursive: true });

console.log("done — commit the EF-Map repo change and deploy it from there.");
