/**
 * Load the repo-root .env into process.env before config is read. Resolved
 * relative to this file (not cwd) so it works however the worker is launched.
 * Import this FIRST, before any module that calls loadEnv().
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });
