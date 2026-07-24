import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const currentFile = fileURLToPath(import.meta.url);
const apiDistDir = path.dirname(currentFile);
const appRootFromDist = path.resolve(apiDistDir, '../../../..');

function resolveFromRoot(rootDir: string, target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }

  return path.resolve(rootDir, target);
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/protect_broker'),
  PB_APP_ROOT: z.string().default(process.cwd()),
  PB_DATA_DIR: z.string().default('/var/lib/protect-broker'),
  PB_WEB_DIST_DIR: z.string().default('apps/web/dist'),
});

const parsedConfig = configSchema.parse(process.env);
const appRoot = resolveFromRoot(appRootFromDist, parsedConfig.PB_APP_ROOT);

export const config = {
  ...parsedConfig,
  PB_APP_ROOT: appRoot,
  PB_DATA_DIR: resolveFromRoot(appRoot, parsedConfig.PB_DATA_DIR),
  PB_WEB_DIST_DIR: resolveFromRoot(appRoot, parsedConfig.PB_WEB_DIST_DIR),
};
