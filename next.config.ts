import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Schlankes Produktions-Bundle: `next build` legt unter .next/standalone einen
  // eigenen server.js samt nur der nötigen node_modules ab (für das Docker-Image).
  output: "standalone",
  logging: {
    browserToTerminal: true,
  }
};

export default nextConfig;
