import type { NextConfig } from "next";
import { securityHeaders } from "./security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const serverOrigin =
      process.env.SERVER_INTERNAL_ORIGIN ?? "http://127.0.0.1:4000";
    return [
      { source: "/api/:path*", destination: `${serverOrigin}/api/:path*` },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
