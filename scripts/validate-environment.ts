import nextEnvironment from "@next/env";

import { parseEnvironment } from "../src/config/environment";

nextEnvironment.loadEnvConfig(process.cwd());
parseEnvironment(process.env);

console.info("Environment configuration is valid.");
