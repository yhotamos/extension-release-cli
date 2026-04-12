import fs from 'node:fs';
import path from 'node:path';
import { PassThrough, type Writable } from 'node:stream';
import archiver from 'archiver';
import type { Command } from 'commander';
import kleur from 'kleur';
import { deleteFileIfExists, makeDirectoryIfNotExists } from '../../utils/fs';
import { getManifestData } from '../../utils/manifest';

const RELEASES_DIR = 'releases';

export type PackOptions = {
  name?: string;
  releasesDir?: string;
  force?: boolean;
  dryRun?: boolean;
};

export function packCommand(program: Command) {
  program
    .command('pack')
    .description('pack the extension source directory into a zip archive')
    .argument(
      '<source>',
      'extension source directory with manifest.json to pack (e.g., dist/, my-extension/)',
    )
    .option('-n, --name <name>', 'base name to use for the zip file')
    .option('-r, --releases-dir <dir>', 'directory to save the zip file (default: releases/)')
    .option('-f, --force', 'overwrite existing zip file if it exists')
    .option('--dry-run', 'perform a trial run with no changes made')
    .action(async (source: string, options: PackOptions = {}) => {
      try {
        await packExtension(source, options);
        if (options.dryRun) {
          console.log(
            `\n  if the zip file name is not as expected, consider using the --name option to specify a custom base name for the zip file.`,
          );
        }
      } catch (error) {
        console.error(`error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });
}

/**
 * Packs the extension source directory into a zip archive.
 * Returns the absolute path to the created zip file, or null if the operation was not performed.
 */
export async function packExtension(
  source: string,
  options: PackOptions = {},
  header?: string,
): Promise<string | null> {
  if (!fs.existsSync(source)) {
    throw new Error(`source directory '${source}' does not exist`);
  }

  const resolvedSource = path.resolve(source);
  const resolvedReleasesDir = path.resolve(options.releasesDir ?? RELEASES_DIR);
  if (resolvedSource === process.cwd()) {
    throw new Error(
      "refusing to pack the current working directory '.'. specify a subdirectory to pack (e.g. dist/).",
    );
  }

  const relative = path.relative(resolvedSource, resolvedReleasesDir);
  const isInsideSource =
    relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (isInsideSource) {
    throw new Error(
      `releases directory '${resolvedReleasesDir}' must not be the same as or inside the source directory '${resolvedSource}'.`,
    );
  }

  const { identifier, zipFileName, manifestData } = resolvePackZipFileName(source, options);
  const zipFilePath = path.join(resolvedReleasesDir, zipFileName);

  console.log(header ?? `--- packing '${source}' into a zip archive ---`);
  console.log(`  identifier: ${identifier}`);
  console.log(`  extension name: ${manifestData.name}`);
  console.log(`  version: ${manifestData.version}`);
  console.log(`  source: ${source}\n`);

  if (options.dryRun) {
    const passthrough = new PassThrough();
    let size = 0;
    passthrough.on('data', (chunk: Buffer) => {
      size += chunk.length;
    });
    await createZipArchive(source, zipFilePath, passthrough);
    console.log(`${kleur.green('✔')} pack completed`);
    console.log(`  would pack: ${zipFilePath}`);
    console.log(`  estimated size: ${formatSize(size)}`);
    return null;
  }

  makeDirectoryIfNotExists(resolvedReleasesDir);

  if (options.force) {
    deleteFileIfExists(zipFilePath);
  } else if (fs.existsSync(zipFilePath)) {
    console.warn(
      `${kleur.yellow('⚠')} zip file already exists '${zipFilePath}'.\n ` +
        ` use --force option to overwrite.`,
    );
    return null;
  }

  const size = await createZipArchive(source, zipFilePath);
  console.log(`${kleur.green('✔')} pack completed!`);
  console.log(`  packed: ${zipFilePath}`);
  console.log(`  size: ${formatSize(size)}`);
  return zipFilePath;
}

type PackZipFileName = {
  identifier: string;
  zipFileName: string;
  manifestData: { name: string; version: string };
};

export function resolvePackZipFileName(source: string, options: PackOptions = {}): PackZipFileName {
  const projectName = path.basename(process.cwd());
  const manifestData = getManifestData(source);
  const extensionName = manifestData.name;
  const version = manifestData.version;

  if (options.name) {
    if (!/^[a-zA-Z0-9-]+$/.test(options.name)) {
      throw new Error(
        `invalid --name value '${options.name}'. \n` +
          `allowed characters: letters (A-Z,a-z), numbers (0-9), and hyphens (-). \n` +
          `example: my-extension-1`,
      );
    }
    return {
      identifier: generateIdentifier(options.name, version),
      zipFileName: generateZipFileName(options.name, version),
      manifestData,
    };
  }

  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (typeof pkg.name === 'string') {
        return {
          identifier: generateIdentifier(pkg.name, version),
          zipFileName: generateZipFileName(pkg.name, version),
          manifestData,
        };
      }
    }
  } catch {
    /* ignore errors and fallback to other methods */
  }

  if (projectName && projectName.length > 0) {
    const sanitized = sanitizeName(projectName);
    if (sanitized && sanitized.length > 0) {
      return {
        identifier: generateIdentifier(sanitized, version),
        zipFileName: generateZipFileName(sanitized, version),
        manifestData,
      };
    }
  }

  const sanitizedManifest = sanitizeName(String(extensionName || ''));
  return {
    identifier: generateIdentifier(sanitizedManifest, version),
    zipFileName: generateZipFileName(sanitizedManifest, version),
    manifestData,
  };
}

function createZipArchive(
  source: string,
  zipFilePath: string,
  outputStream?: Writable,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const output: Writable = outputStream ?? fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.glob('**/*', {
      cwd: source,
      dot: true,
      ignore: [
        '**/.DS_Store',
        '**/__MACOSX/**',
        '**/.git/**',
        '**/.vscode/**',
        '**/.github/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/releases/**',
      ],
    });

    const onClose = () => {
      try {
        const size = archive.pointer();
        cleanup();
        resolve(size);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const onError = (err: unknown) => {
      cleanup();
      const message = err instanceof Error ? err.message : String(err);
      reject(new Error(`failed to create zip archive '${message}'`));
    };

    const onWarning = (err: unknown) => {
      const maybe = err as { code?: string; message?: string } | null;
      if (maybe && maybe.code === 'ENOENT') {
        console.warn(`warning: ${maybe.message}`);
      } else {
        onError(err);
      }
    };

    const cleanup = () => {
      archive.removeAllListeners();
      output.removeListener('close', onClose);
      output.removeListener('error', onError);
    };

    output.on('close', onClose);
    output.on('error', onError);
    archive.on('error', onError);
    archive.on('warning', onWarning);

    archive.pipe(output);
    void archive.finalize();
  });
}

function formatSize(sizeInBytes: number): string {
  switch (true) {
    case sizeInBytes < 1024:
      return `${sizeInBytes} B`;
    case sizeInBytes < 1024 * 1024:
      return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    case sizeInBytes < 1024 * 1024 * 1024:
      return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
    default:
      return `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

export function generateIdentifier(name: string, version: string | null | undefined): string {
  const sanitized = sanitizeName(name);
  let versionSuffix = '';
  if (version && version.length > 0) {
    versionSuffix = `@${version}`;
  }
  return `${sanitized || 'extension'}${versionSuffix || ''}`;
}

export function generateZipFileName(name: string, version: string | null | undefined): string {
  const sanitized = sanitizeName(name);
  let versionSuffix = '';
  if (version && version.length > 0) {
    versionSuffix = `-${version}`;
  }
  return `${sanitized || 'extension'}${versionSuffix || ''}.zip`;
}

export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
