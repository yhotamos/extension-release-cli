import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { select } from '@inquirer/prompts';
import type { Command } from 'commander';
import kleur from 'kleur';
import type { ReleaseType } from 'semver';
import { inc, sort as semverSort, valid } from 'semver';

type VersionOptions = {
  manifest: string[];
  package: string[];
  tag?: string;
  preid?: string;
  interactive: boolean;
};

type VersionSource = {
  filePath: string;
  data: Record<string, unknown>;
  version: string;
};

export function versionCommand(program: Command) {
  program
    .command('version')
    .description('synchronize and bump extension version in manifest.json and package.json')
    .argument(
      '[release]',
      'new version or release type: major|minor|patch|premajor|preminor|prepatch|prerelease',
    )
    .option('--manifest <paths...>', 'paths to manifest.json files', ['./dist/manifest.json'])
    .option('--package <paths...>', 'paths to package.json files', ['./package.json'])
    .option('--tag <identifier>', 'prerelease tag identifier (e.g., beta)')
    .option('--preid <identifier>', 'alias of --tag')
    .option('--interactive', 'interactively select base version when versions differ', false)
    .action(async (release: string | undefined, options: VersionOptions) => {
      console.log('--- extension version ---');

      try {
        const manifestSources = options.manifest.map(readVersionSource);
        const packageSources = options.package.filter(existsSync).map(readVersionSource);
        const tag = resolveTag(options.tag, options.preid, release);

        if (!release) {
          printCurrentVersions(manifestSources, packageSources);
          return;
        }

        const baseVersion = await resolveBaseVersion(
          manifestSources,
          packageSources,
          options.interactive,
        );
        const targetVersion = resolveTargetVersion(release, baseVersion, tag);

        for (const source of manifestSources) {
          applyVersionToSource(source, targetVersion);
        }

        for (const source of packageSources) {
          applyVersionToSource(source, targetVersion);
          updatePackageLockVersion(source.filePath, targetVersion);
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
  manifestSources: VersionSource[],
  packageSources: VersionSource[],
): void {
  for (const source of manifestSources) {
    console.log(`manifest version: ${source.version} (${source.filePath})`);
  }
  for (const source of packageSources) {
    console.log(`package.json version: ${source.version} (${source.filePath})`);
  }

  const allSources = [...manifestSources, ...packageSources];
  const uniqueVersions = new Set(allSources.map((s) => s.version));
  if (uniqueVersions.size === 1) {
    console.log(kleur.green(`synchronized version: ${[...uniqueVersions][0]}`));
  } else {
    console.log(kleur.yellow('versions are not synchronized'));
  }
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

function updatePackageLockVersion(packagePath: string, targetVersion: string): void {
  const lockPath = getPackageLockPath(packagePath);
  if (!existsSync(lockPath)) {
    console.log(kleur.yellow(`package-lock.json was not found next to ${packagePath}`));
    return;
  }

  const raw = readFileSync(lockPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!isRecord(parsed)) {
    return;
  }

  const rootChanged = setVersionIfString(parsed, targetVersion);
  const packageChanged = updateRootPackageLockVersion(parsed, targetVersion);

  if (!rootChanged && !packageChanged) {
    return;
  }

  writeFileSync(lockPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
  console.log(`${formatPathForLog(lockPath)} version updated to ${targetVersion}`);
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
  manifestSources: VersionSource[],
  packageSources: VersionSource[],
  interactive: boolean,
): Promise<string> {
  const allSources = [...manifestSources, ...packageSources];
  const uniqueVersions = [...new Set(allSources.map((s) => s.version))];

  if (uniqueVersions.length === 1) {
    return uniqueVersions[0];
  }

  if (!interactive) {
    const min = semverSort(uniqueVersions)[0];
    console.log(kleur.yellow(`versions differ across files. using lowest: ${min}`));
    return min;
  }

  const choice = await select({
    message: 'versions differ across files. choose a base version:',
    choices: [
      ...uniqueVersions.map((v) => {
        const files = allSources
          .filter((s) => s.version === v)
          .map((s) => s.filePath)
          .join(', ');
        return { name: `${v} (${files})`, value: v };
      }),
      { name: 'Cancel', value: 'cancel' },
    ],
  });

  if (choice === 'cancel') {
    throw new Error('version update cancelled by user');
  }

  return choice;
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
