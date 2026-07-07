import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load the repo-root .env so web + worker share one env file. App-local
// .env.local (loaded by Next itself) still wins over these.
const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, '../../.env') });

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
