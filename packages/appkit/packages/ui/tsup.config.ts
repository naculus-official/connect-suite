import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  external: [
    /^@naculus\//,
    "lucide-react",
    "react",
  ],
  // Bundle QR rendering so consumers do not inherit qrcode's Node-oriented
  // CommonJS entry (which expects a global `require` in the browser).
  noExternal: ["qrcode"],
});
