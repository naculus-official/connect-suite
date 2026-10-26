/// <reference types="vite/client" />

import type { Preview } from "@storybook/react";
import "../packages/ui/src/styles/tokens.css";
import "../packages/ui/src/styles/utilities.css";
// The built file is what consumers import; Storybook's Vite has no Tailwind
// plugin, so the source file would load with its directives uncompiled.
import "../packages/ui/dist/styles/preflight.css";
import "../packages/ui/dist/styles/components.css";
import { Web3ComponentProvider } from "../packages/ui/src/contexts/ComponentRegistry";

// Stencil runtime: provide h() for WC component JSX runtime
(window as any).h =
  (window as any).h ||
  ((tag: string, props: any, ...children: any[]) => {
    const el =
      typeof tag === "function" ? new tag() : document.createElement(tag);
    if (props) {
      Object.entries(props).forEach(([k, v]) => {
        if (k === "className") (el as any).className = v;
        else if (k === "style") Object.assign((el as any).style, v);
        else if (k.startsWith("on"))
          el.addEventListener(k.slice(2).toLowerCase(), v as any);
        else el.setAttribute(k, v as any);
      });
    }
    children.flat().forEach((child) => {
      if (child == null || child === false) return;
      el.appendChild(
        typeof child === "string" || typeof child === "number"
          ? document.createTextNode(String(child))
          : child,
      );
    });
    return el;
  });

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  decorators: [
    (Story) => (
      <Web3ComponentProvider>
        <Story />
      </Web3ComponentProvider>
    ),
  ],
};

export default preview;
