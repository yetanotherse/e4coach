/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bundle the workspace packages (they ship raw TS).
  transpilePackages: [
    '@chess-coach/core',
    '@chess-coach/adapters',
    '@chess-coach/config',
    '@chess-coach/db',
  ],
  experimental: {
    // Prisma client must stay external to the server bundle.
    serverComponentsExternalPackages: ['@prisma/client', '.prisma/client'],
  },
  webpack: (config) => {
    // Workspace packages ship raw TS with explicit .js import specifiers
    // (TS "Bundler" resolution). Teach webpack to resolve those to .ts sources.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
