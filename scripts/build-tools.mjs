/**
 * Bundles the CLI scripts into plain JavaScript for the production `tools` image, so it
 * needs neither tsx, drizzle-kit nor the rest of the dev dependencies.
 * Output: tools/<name>.mjs. Run by the Dockerfile; usage: pnpm build:tools
 */
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";

const ENTRIES = ["migrate", "seed", "create-user", "send-reminders", "jobs"];

/**
 * Native modules can't be bundled; the Dockerfile installs exactly these, at the
 * versions in package.json (written to `tools/package.json` below).
 */
const EXTERNAL = ["@node-rs/argon2"];

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: Object.fromEntries(ENTRIES.map((name) => [name, `scripts/${name}.ts`])),
  outdir: "tools",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  // `server-only` resolves to an empty module under this condition (as with tsx).
  conditions: ["react-server"],
  external: EXTERNAL,
  // Some bundled CommonJS packages call require() for Node built-ins.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  sourcemap: "linked",
  logLevel: "info",
});

// What the image must install next to the bundles, pinned to package.json.
const runtimeDeps = Object.fromEntries(EXTERNAL.map((name) => [name, pkg.dependencies[name]]));
const toolsPkg = {
  name: "dogstuff-tools",
  private: true,
  type: "module",
  dependencies: runtimeDeps,
};
await writeFile("tools/package.json", `${JSON.stringify(toolsPkg, null, 2)}\n`);
