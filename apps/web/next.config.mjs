/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['db'],
  serverExternalPackages: ['@prisma/client', 'prisma'],
};

export default nextConfig;
