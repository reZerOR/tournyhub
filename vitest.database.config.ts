import nextEnvironment from "@next/env";
import { defineConfig } from "vitest/config";

import { parseEnvironment } from "./src/config/environment";

nextEnvironment.loadEnvConfig(process.cwd());
parseEnvironment(process.env);

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["tests/database/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
