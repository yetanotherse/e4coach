import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PrismaPlugin } from '@prisma/nextjs-monorepo-workaround-plugin';

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
  webpack: (config, { isServer }) => {
    // Workspace packages ship raw TS with explicit .js import specifiers
    // (TS "Bundler" resolution). Teach webpack to resolve those to .ts sources.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    // Copy the Prisma query engine next to the server bundle and rewrite its
    // runtime lookup path. Required because the client lives in a custom
    // monorepo output (packages/db/generated/client) that Next's file tracer
    // resolves to a build-time absolute path that doesn't exist on Vercel's
    // Lambda. This is the official pris.ly/d/engine-not-found-nextjs fix.
    if (isServer) {
      config.plugins = [...config.plugins, new PrismaPlugin()];
    }
    return config;
  },
};

export default nextConfig;
