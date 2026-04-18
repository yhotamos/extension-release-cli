import fs from 'node:fs';
import { config } from '@dotenvx/dotenvx';
import { cleanEnv, str } from 'envalid';
import type { StoreConfig } from '../types';

const REQUIRED_ENV_KEYS = [
  'CLIENT_ID',
  'CLIENT_SECRET',
  'REFRESH_TOKEN',
  'PUBLISHER_ID',
  'EXTENSION_ID',
] as const;

function hasRequiredEnvVars(): boolean {
  return REQUIRED_ENV_KEYS.every((key) => {
    const value = process.env[key];
    return typeof value === 'string' && value.length > 0;
  });
}

export function loadEnvConfig(path?: string): void {
  let paths: string[];

  if (path) {
    if (!fs.existsSync(path)) {
      throw new Error(`environment file not found '${path}'`);
    }
    paths = [path];
  } else {
    paths = ['.env.local', '.env'];
  }

  const existing = paths.filter((p) => fs.existsSync(p));

  if (existing.length === 0) {
    if (!path && hasRequiredEnvVars()) {
      console.log('  using environment variables from process.env');
      return;
    }

    const sources = paths.map((p) => `'${p}'`).join(' or ');
    throw new Error(`environment file not found in ${sources}`);
  }

  console.log(`  loading environment variables from ${existing.map((p) => `'${p}'`).join(', ')}`);

  config({
    path: existing,
    quiet: true,
  });
}

export function loadEnv(): StoreConfig {
  const env = cleanEnv(process.env, {
    CLIENT_ID: str(),
    CLIENT_SECRET: str(),
    REFRESH_TOKEN: str(),
    PUBLISHER_ID: str(),
    EXTENSION_ID: str(),
  });

  return {
    clientId: env.CLIENT_ID,
    clientSecret: env.CLIENT_SECRET,
    refreshToken: env.REFRESH_TOKEN,
    publisherId: env.PUBLISHER_ID,
    extensionId: env.EXTENSION_ID,
  };
}
