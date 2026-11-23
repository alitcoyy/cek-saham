import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Supaya hot reload jalan saat dibuka dari HP lewat IP lokal (mis. http://192.168.1.10:3000).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  // Chromium serverless untuk PDF di Vercel: jangan dibundel, dan sertakan file biner terkompresinya.
  serverExternalPackages: ['@sparticuz/chromium'],
  outputFileTracingIncludes: { '/api/pdf': ['./node_modules/@sparticuz/chromium/bin/**'] },
};

export default nextConfig;
