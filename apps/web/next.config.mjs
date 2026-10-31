/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  agentRules: false,
  transpilePackages: ["@clipper/video"],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
