import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "ui/index": "src/ui/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  // react comes with @naculus/connect-appkit-react (a peer); never bundle it.
  external: [/^@naculus\//, "react", /^react\//],
});
