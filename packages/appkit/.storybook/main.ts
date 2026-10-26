import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";
import { getAliases } from "../test-utils/aliases";

const root = process.cwd();

const config: StorybookConfig = {
  stories: [
    "../packages/wc/src/stories/**/*.stories.@(ts|tsx)",
    // The ui package's stories were written but never globbed here, so
    // Storybook had never loaded one of them.
    "../packages/ui/src/**/*.stories.@(ts|tsx)",
  ],
  addons: [],
  framework: { name: "@storybook/react-vite", options: {} },
  viteFinal: (config) => {
    const existingAlias = (config.resolve?.alias || {}) as Record<string, string>;
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: [
          // Prefix alias for WC dist imports
          { find: /^@naculus\/connect-appkit-wc\/dist\/(.*)/, replacement: `${path.resolve(root, "packages/wc/dist")}/$1` },
          ...Object.entries({ ...getAliases(root), ...existingAlias }).map(([find, replacement]) => ({ find, replacement })),
        ],
      },
    define: { ...config.define, "process.env": "{}" },
    esbuild: { jsx: "automatic" },
    optimizeDeps: {
      include: [
        "react", "react-dom", "react/jsx-dev-runtime",
        "class-variance-authority", "clsx", "tailwind-merge",
        "@radix-ui/react-slot", "@radix-ui/react-dialog",
        "@radix-ui/react-switch", "@radix-ui/react-checkbox",
        "@radix-ui/react-tabs", "@radix-ui/react-tooltip",
        "@radix-ui/react-progress", "@radix-ui/react-avatar",
        "@radix-ui/react-label", "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-scroll-area", "@radix-ui/react-popover",
        "@radix-ui/react-separator", "@radix-ui/react-select",
        "lucide-react", "qrcode",
        "@floating-ui/dom",
        "../packages/wc/dist/components/index.js",
      ],
    },
    ssr: { noExternal: ["react", "react-dom"] },
  };
}
};

export default config;
