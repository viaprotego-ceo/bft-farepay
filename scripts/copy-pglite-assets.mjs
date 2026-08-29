import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dest = join(
  ".vercel",
  "output",
  "functions",
  "__server.func",
  "_libs",
);
if (!existsSync(dest)) process.exit(0);
mkdirSync(dest, { recursive: true });
const src = join("node_modules", "@electric-sql", "pglite", "dist");
for (const file of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  const from = join(src, file);
  if (existsSync(from)) copyFileSync(from, join(dest, file));
}
