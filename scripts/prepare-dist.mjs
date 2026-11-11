import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(root);
const outputRoot = path.join(projectRoot, "dist");

await mkdir(outputRoot, { recursive: true });

for (const directory of ["config", "lib", "middleware", "models", "routes", "views", "public"]) {
  await cp(path.join(projectRoot, directory), path.join(outputRoot, directory), {
    recursive: true,
    force: true,
  });
}
