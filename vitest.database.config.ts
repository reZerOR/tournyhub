import { fileURLToPath } from "node:url";

import nextEnvironment from "@next/env";
import { defineConfig } from "vitest/config";

import { parseEnvironment } from "./src/config/environment";

const env = process.env as Record<string, string | undefined>;
const savedNodeEnv = env.NODE_ENV;
env.NODE_ENV = "development";
nextEnvironment.loadEnvConfig(process.cwd());
env.NODE_ENV = savedNodeEnv;
parseEnvironment(process.env);

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    fileParallelism: false,
    include: ["tests/database/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
