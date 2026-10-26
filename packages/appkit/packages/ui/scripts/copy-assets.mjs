import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assets = ["index.css", "tokens.css", "utilities.css"];

await Promise.all(
  assets.map(async (name) => {
    const destination = resolve(root, "dist", "styles", name);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(root, "src", "styles", name), destination);
  }),
);
