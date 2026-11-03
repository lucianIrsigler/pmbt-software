/**
 * `pnpm start`: runs the production build the same way the Docker image does
 * (.next/standalone/server.js), after copying in the static files the standalone output
 * leaves out. Port and host come from PORT / HOSTNAME (default 3000 on all interfaces).
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";

const root = ".next/standalone";
if (!existsSync(`${root}/server.js`)) {
  console.error("No standalone build found: run `pnpm build` first.");
  process.exit(1);
}
cpSync(".next/static", `${root}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${root}/public`, { recursive: true });

const server = spawn(process.execPath, [`${root}/server.js`], { stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
