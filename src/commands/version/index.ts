import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  label: 'manifest' | 'package.json';
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
    .option('--manifest <path>', 'custom path to manifest.json', './dist/manifest.json')
    .option('--package-path <path>', 'custom path to package.json', './package.json')
    .option('--tag <identifier>', 'prerelease tag identifier (e.g., beta)')
    .option('--preid <identifier>', 'alias of --tag')
    .action(async (release: string | undefined, options: VersionOptions) => {
      console.log('--- extension version ---');

      const manifestPath = options.manifest;
      const packagePath = options.packagePath;

      try {
        const manifestSource = readVersionSource(manifestPath, 'manifest');
        const packageSource = existsSync(packagePath)
          ? readVersionSource(packagePath, 'package.json')
          : null;
        const tag = resolveTag(options.tag, options.preid, release);

        if (!release) {
          printCurrentVersions(manifestSource, packageSource, packagePath);
          return;
        }

        const baseVersion = await resolveBaseVersion(manifestSource, packageSource);
        const targetVersion = resolveTargetVersion(release, baseVersion, tag);

        updateSourceVersion(manifestSource, targetVersion);
        writeVersionSource(manifestSource);
        console.log(`${manifestSource.filePath} version updated to ${targetVersion}`);

        if (packageSource) {
          updateSourceVersion(packageSource, targetVersion);
          writeVersionSource(packageSource);
          console.log(`${packageSource.filePath} version updated to ${targetVersion}`);
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

function readVersionSource(filePath: string, label: 'manifest' | 'package.json'): VersionSource {
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
    label,
    data: parsed,
    version: parsed.version,
  };
}

function writeVersionSource(source: VersionSource): void {
  writeFileSync(source.filePath, `${JSON.stringify(source.data, null, 2)}\n`, 'utf-8');
}

function updateSourceVersion(source: VersionSource, targetVersion: string): void {
  source.data.version = targetVersion;
  source.version = targetVersion;
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

  if (choice === 'manifest') {
    return manifestSource.version;
  }
  if (choice === 'package') {
    return packageSource.version;
  }

  throw new Error('version update cancelled by user');
}

function resolveTargetVersion(
  releaseArg: string | undefined,
  currentVersion: string,
  tag: string | undefined,
): string {
  const release = releaseArg ?? 'patch';

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
