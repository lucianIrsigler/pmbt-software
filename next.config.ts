import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server (.next/standalone) for the production Docker image.
  output: "standalone",
  // Cache Components is deliberately off. With it on, request-time content must sit inside
  // <Suspense> and is streamed in by a script, so pages don't work without JavaScript,
  // `notFound()` can't send a 404 and redirects become client-side. This app's pages are
  // all request-time and small, so we render each one fully on the server instead.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
