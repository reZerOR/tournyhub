import type { NextConfig } from "next";

import { parseEnvironment } from "./src/config/environment";

parseEnvironment(process.env);

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Player import files are limited to 5 MB in
      // `src/domain/player-import.ts`; multipart encoding needs headroom above
      // that. Keep the two in step when either changes.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
