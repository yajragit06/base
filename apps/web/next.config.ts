import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// The monorepo keeps one `.env` at its root (see `.env.example`); Next.js reads only its
// own folder. Values already set by the host (such as Vercel) win.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {};

export default nextConfig;
