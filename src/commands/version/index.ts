import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { select } from '@inquirer/prompts';
import type { Command } from 'commander';
import kleur from 'kleur';
import type { ReleaseType } from 'semver';
import { inc, valid } from 'semver';

type VersionOptions = {
  manifest: string;
  packagePath: string;
  tag?: string;
  preid?: string;
};

type VersionSource = {
  filePath: string;
  data: Record<string, unknown>;
  version: string;
};

type PackageLockStatus = 'updated' | 'not-found' | 'skipped';

export function versionCommand(program: Command) {
  program
    .command('version')
    .description('synchronize and bump extension version in manifest.json and package.json')
    .argument(
      '[release]',
      'new version or release type: major|minor|patch|premajor|preminor|prepatch|prerelease',
    )
    .option('--manifest <path>', 'custom path to manifest.json', './dist/manifest.json')
    .option('--package-path <path>', 'custom path to package.json', './package.json')
    .option('--tag <identifier>', 'prerelease tag identifier (e.g., beta)')
    .option('--preid <identifier>', 'alias of --tag')
    .action(async (release: string | undefined, options: VersionOptions) => {
      console.log('--- extension version ---');

      const manifestPath = options.manifest;
      const packagePath = options.packagePath;

      try {
        const manifestSource = readVersionSource(manifestPath);
        const packageSource = existsSync(packagePath) ? readVersionSource(packagePath) : null;
        const tag = resolveTag(options.tag, options.preid, release);

        if (!release) {
          printCurrentVersions(manifestSource, packageSource, packagePath);
          return;
        }

        const baseVersion = await resolveBaseVersion(manifestSource, packageSource);
        const targetVersion = resolveTargetVersion(release, baseVersion, tag);

        applyVersionToSource(manifestSource, targetVersion);

        if (packageSource) {
          applyVersionToSource(packageSource, targetVersion);
          const lockFileStatus: PackageLockStatus = updatePackageLockVersion(
            packageSource.filePath,
            targetVersion,
          );
          if (lockFileStatus === 'updated') {
            console.log(
              `${formatPathForLog(getPackageLockPath(packageSource.filePath))} version updated to ${targetVersion}`,
            );
          } else if (lockFileStatus === 'not-found') {
            console.log(
              kleur.yellow(`package-lock.json was not found next to ${packageSource.filePath}`),
            );
          }
        } else {
          console.log(
            kleur.yellow(
              `package.json was not found at ${packagePath}. manifest only was updated.`,
            ),
          );
        }
      } catch (error) {
        const msg =
          error instanceof Error ? error.message.replace(/^Error:\s*/, '') : String(error);
        console.error(kleur.red(`✖ error: ${msg}`));
        process.exit(1);
      }
    });
}

function printCurrentVersions(
  manifestSource: VersionSource,
  packageSource: VersionSource | null,
  packagePath: string,
): void {
  console.log(`manifest version: ${manifestSource.version} (${manifestSource.filePath})`);
  if (packageSource) {
    console.log(`package.json version: ${packageSource.version} (${packageSource.filePath})`);
    if (manifestSource.version === packageSource.version) {
      console.log(kleur.green(`synchronized version: ${manifestSource.version}`));
    } else {
      console.log(kleur.yellow('manifest and package.json versions are different'));
    }
    return;
  }
  console.log(kleur.yellow(`package.json was not found at ${packagePath}`));
}

function readVersionSource(filePath: string): VersionSource {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  if (typeof parsed.version !== 'string') {
    throw new Error(`version field is missing or not a string in ${filePath}`);
  }
  if (!valid(parsed.version)) {
    throw new Error(`invalid semver version in ${filePath}: ${parsed.version}`);
  }

  return {
    filePath,
    data: parsed,
    version: parsed.version,
  };
}

function applyVersionToSource(source: VersionSource, targetVersion: string): void {
  source.data.version = targetVersion;
  source.version = targetVersion;
  writeFileSync(source.filePath, `${JSON.stringify(source.data, null, 2)}\n`, 'utf-8');
  console.log(`${source.filePath} version updated to ${targetVersion}`);
}

function getPackageLockPath(packagePath: string): string {
  return join(dirname(packagePath), 'package-lock.json');
}

function formatPathForLog(filePath: string): string {
  if (isAbsolute(filePath) || filePath.startsWith('./') || filePath.startsWith('../')) {
    return filePath;
  }
  return `./${filePath}`;
}

function updatePackageLockVersion(packagePath: string, targetVersion: string): PackageLockStatus {
  const lockPath = getPackageLockPath(packagePath);
  if (!existsSync(lockPath)) {
    return 'not-found';
  }

  const raw = readFileSync(lockPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!isRecord(parsed)) {
    return 'skipped';
  }

  const rootChanged = setVersionIfString(parsed, targetVersion);
  const packageChanged = updateRootPackageLockVersion(parsed, targetVersion);
  const changed = rootChanged || packageChanged;

  if (!changed) {
    return 'skipped';
  }

  writeFileSync(lockPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
  return 'updated';
}

function setVersionIfString(target: Record<string, unknown>, targetVersion: string): boolean {
  if (typeof target.version !== 'string') {
    return false;
  }
  target.version = targetVersion;
  return true;
}

function updateRootPackageLockVersion(
  lockJson: Record<string, unknown>,
  targetVersion: string,
): boolean {
  const packagesField = lockJson.packages;
  if (!isRecord(packagesField)) {
    return false;
  }

  const rootPackage = packagesField[''];
  if (!isRecord(rootPackage)) {
    return false;
  }

  return setVersionIfString(rootPackage, targetVersion);
}

async function resolveBaseVersion(
  manifestSource: VersionSource,
  packageSource: VersionSource | null,
): Promise<string> {
  if (!packageSource || manifestSource.version === packageSource.version) {
    return manifestSource.version;
  }

  const choice = await select({
    message: `manifest (${manifestSource.version}) and package.json (${packageSource.version}) are different. choose a base version:`,
    choices: [
      {
        name: `Use manifest version (${manifestSource.version})`,
        value: 'manifest',
      },
      {
        name: `Use package.json version (${packageSource.version})`,
        value: 'package',
      },
      {
        name: 'Cancel',
        value: 'cancel',
      },
    ],
  });

  if (choice === 'cancel') {
    throw new Error('version update cancelled by user');
  }

  return choice === 'manifest' ? manifestSource.version : packageSource.version;
}

function resolveTargetVersion(
  release: string,
  currentVersion: string,
  tag: string | undefined,
): string {
  if (isReleaseType(release)) {
    const incremented = tag ? inc(currentVersion, release, tag) : inc(currentVersion, release);
    if (!incremented) {
      throw new Error(
        `failed to increment version from ${currentVersion} with release type '${release}'`,
      );
    }
    return incremented;
  }

  if (!valid(release)) {
    throw new Error(`invalid version '${release}'`);
  }
  if (tag) {
    throw new Error('--tag/--preid cannot be used with an explicit version argument');
  }

  return release;
}

function resolveTag(
  tag: string | undefined,
  preid: string | undefined,
  release: string | undefined,
): string | undefined {
  if (tag && preid && tag !== preid) {
    throw new Error(
      `--tag and --preid must match when both are specified (got '${tag}' and '${preid}')`,
    );
  }
  if (!release && (tag || preid)) {
    throw new Error('--tag/--preid requires a release type argument');
  }
  return tag ?? preid;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isReleaseType(value: string): value is ReleaseType {
  return (
    value === 'major' ||
    value === 'minor' ||
    value === 'patch' ||
    value === 'premajor' ||
    value === 'preminor' ||
    value === 'prepatch' ||
    value === 'prerelease'
  );
}
