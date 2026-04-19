import { defineConfig } from 'tsup';
import { cpSync } from 'node:fs';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  bundle: true,
  minify: true,
  treeshake: true,
  external: ['commander', 'kleur', 'ora'],
  dts: false,
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  onSuccess: async () => {
    cpSync('src/assets', 'dist/', { recursive: true });
  },
});
