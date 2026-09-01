import {fileURLToPath} from "node:url";

import {configDefaults, defineConfig} from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tooling/testing/server-only.mjs", import.meta.url)),
    },
  },
  test: {exclude: [...configDefaults.exclude, "**/*.integration.test.ts"]},
});
