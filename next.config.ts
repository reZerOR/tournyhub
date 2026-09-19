import type { NextConfig } from "next";

import { parseEnvironment } from "./src/config/environment";

parseEnvironment(process.env);

const nextConfig: NextConfig = {/* config options here */};

export default nextConfig;
