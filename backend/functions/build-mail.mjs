import { log } from "node:console";
import { build } from "esbuild";
import { URL, fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(root + ".runtime/neon-mail/function", {
  recursive: true,
  mode: 0o700,
});
await build({
  absWorkingDir: root,
  entryPoints: ["functions/dearlymail/index.ts"],
  outfile: ".runtime/neon-mail/function/index.mjs",
  platform: "node",
  target: "node24",
  format: "esm",
  bundle: true,
  external: ["pg-native"],
  banner: {
    js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);',
  },
});
log("Neon mail function bundled. Private environment is not included.");
