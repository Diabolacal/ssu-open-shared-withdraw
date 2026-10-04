import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";

// Item icons are the game's own art and are not in git (see README, "Item
// icons"). A build without them still works (blank tiles), so only warn,
// loudly, so a deploy does not ship icon-less by accident.
function warnWithoutIcons(): Plugin {
  return {
    name: "warn-without-icons",
    apply: "build",
    buildStart() {
      if (!existsSync(new URL("./public/icons.json", import.meta.url))) {
        this.warn(
          "public/icons.json is missing: this build has NO item icons. " +
            "Generate them from the game client before deploying.",
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), warnWithoutIcons()],
});
