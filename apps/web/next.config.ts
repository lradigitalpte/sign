import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  transpilePackages: ["pdfjs-dist"],
  // pdfjs optionally pulls in node-canvas; stub it out for the browser.
  turbopack: {
    resolveAlias: {
      canvas: { browser: "./empty-module.js" },
    },
  },
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
