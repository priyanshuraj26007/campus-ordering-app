import type { NextConfig } from "next";
const config: NextConfig = { agentRules: false, experimental: { turbopackFileSystemCacheForDev: false }, devIndicators: false, serverExternalPackages: ["better-sqlite3"], turbopack: { root: process.cwd() } };
export default config;
