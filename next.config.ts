import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The pinned snapshots and the int8 embeddings file are read with fs at
  // runtime, so make sure Vercel ships them with every API route.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**/*"],
  },
};

export default nextConfig;
