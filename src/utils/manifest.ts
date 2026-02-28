import fs from "node:fs";
import path from "node:path";

interface Manifest {
  name?: string | Record<string, string>;
  version?: string;
}

interface ManifestData {
  name: string;
  version: string;
}

export function getExtensionName(manifest: Manifest): string | null {
  if (manifest.name) {
    if (typeof manifest.name === 'object') {
      return manifest.name.en || Object.values(manifest.name)[0] || null;
    }
    return manifest.name;
  }
  return null;
}

export function getExtensionVersion(manifest: Manifest): string {
  return manifest.version || '';
}

export function getManifestData(source: string): ManifestData {
  return {
    name: getExtensionName(getManifest(source)) || 'extension',
    version: getExtensionVersion(getManifest(source)),
  };
}

export function getManifest(source: string): Manifest {
  const manifestPath = path.join(source, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in source directory '${source}'`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return manifest;
}