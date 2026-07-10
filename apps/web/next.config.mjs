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
    // Monorepo: trace files from the repo root, not just apps/web.
    outputFileTracingRoot: resolve(here, '../../'),
    // The Prisma query engine (*.so.node) is loaded at runtime via a computed
    // path, so static tracing misses it and Vercel's Lambda can't find it
    // ("Query Engine for runtime rhel-openssl-3.0.x not found"). Force-include
    // the generated client (engines included) next to every API route bundle.
    outputFileTracingIncludes: {
      '/api/**/*': ['../../packages/db/generated/client/**/*'],
    },
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
