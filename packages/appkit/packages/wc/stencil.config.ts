import type { Config } from "@stencil/core";
import { reactOutputTarget } from "@stencil/react-output-target";
import { vueOutputTarget } from "@stencil/vue-output-target";

export const config: Config = {
  namespace: "connect-appkit",
  globalStyle: "src/styles/tokens.css",
  outputTargets: [
    // Auto-generate React wrapper components
    reactOutputTarget({
      outDir: "../react/src/wc-generated/",
      componentCorePackage: "@naculus/connect-appkit-wc",
      proxiesFile: "../react/src/wc-generated/proxies.ts",
      includeDefineCustomElements: false,
    }),
    // Auto-generate Vue wrapper components
    vueOutputTarget({
      outDir: "../vue/src/wc-generated/",
      componentCorePackage: "@naculus/connect-appkit-wc",
      proxiesFile: "../vue/src/wc-generated/proxies.ts",
      includeDefineCustomElements: false,
    }),
    // Standard WC distribution (externalRuntime: false required by React output target)
    {
      type: "dist-custom-elements",
      customElementsExportBehavior: "auto-define-custom-elements",
      externalRuntime: false,
    },
    // Bundle for lazy loading
    {
      type: "dist",
      esmLoaderPath: "../loader",
    },
    // Hydrate script for SSR (optional, for Next.js)
    {
      type: "dist-hydrate-script",
      dir: "./hydrate",
    },
  ],
  // Watch additional files for hot reload (i18n etc.)
  watchIgnoredRegex: /\.test\.|\.spec\.|\.stories\./,
  testing: {
    browserHeadless: "new",
  },
  // Keep the built-in preference explicit: Stencil warns on it unless set.
  nodeResolve: { preferBuiltins: true },
};
