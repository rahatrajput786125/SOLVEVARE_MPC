/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mpc/shared"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

module.exports = nextConfig;
