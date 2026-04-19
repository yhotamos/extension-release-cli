import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { versionCommand } from './index';

const selectMock = vi.hoisted(() => vi.fn());

vi.mock('@inquirer/prompts', () => ({
  select: selectMock,
}));

describe('version command', () => {
  let workspace: string;
  let originalCwd: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'exr-version-'));
    originalCwd = process.cwd();
    process.chdir(workspace);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    selectMock.mockReset();
  });

  it('shows current versions and does not bump when release argument is omitted', async () => {
    fs.writeFileSync(
      './manifest.json',
      JSON.stringify({ version: '1.2.3', name: 'sample' }, null, 2),
    );
    fs.writeFileSync('./package.json', JSON.stringify({ version: '1.2.3', name: 'pkg' }, null, 2));

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(['version', '--manifest', './manifest.json'], { from: 'user' });

    const manifestResult = JSON.parse(fs.readFileSync('./manifest.json', 'utf-8'));
    const packageResult = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

    expect(manifestResult.version).toBe('1.2.3');
    expect(packageResult.version).toBe('1.2.3');
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('bumps patch version when patch is specified explicitly', async () => {
    fs.writeFileSync(
      './manifest.json',
      JSON.stringify({ version: '1.2.3', name: 'sample' }, null, 2),
    );
    fs.writeFileSync('./package.json', JSON.stringify({ version: '1.2.3', name: 'pkg' }, null, 2));

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(['version', 'patch', '--manifest', './manifest.json'], {
      from: 'user',
    });

    const manifestResult = JSON.parse(fs.readFileSync('./manifest.json', 'utf-8'));
    const packageResult = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

    expect(manifestResult.version).toBe('1.2.4');
    expect(packageResult.version).toBe('1.2.4');
  });

  it('updates package-lock.json when package.json is updated', async () => {
    fs.writeFileSync(
      './manifest.json',
      JSON.stringify({ version: '1.2.3', name: 'sample' }, null, 2),
    );
    fs.writeFileSync('./package.json', JSON.stringify({ version: '1.2.3', name: 'pkg' }, null, 2));
    fs.writeFileSync(
      './package-lock.json',
      JSON.stringify(
        {
          name: 'pkg',
          version: '1.2.3',
          lockfileVersion: 3,
          packages: { '': { name: 'pkg', version: '1.2.3' } },
        },
        null,
        2,
      ),
    );

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(['version', 'patch', '--manifest', './manifest.json'], {
      from: 'user',
    });

    const lockResult = JSON.parse(fs.readFileSync('./package-lock.json', 'utf-8'));
    expect(lockResult.version).toBe('1.2.4');
    expect(lockResult.packages[''].version).toBe('1.2.4');
  });

  it('logs package-lock path with ./ prefix for relative package path', async () => {
    fs.writeFileSync(
      './manifest.json',
      JSON.stringify({ version: '1.2.3', name: 'sample' }, null, 2),
    );
    fs.writeFileSync('./package.json', JSON.stringify({ version: '1.2.3', name: 'pkg' }, null, 2));
    fs.writeFileSync(
      './package-lock.json',
      JSON.stringify(
        {
          name: 'pkg',
          version: '1.2.3',
          lockfileVersion: 3,
          packages: { '': { name: 'pkg', version: '1.2.3' } },
        },
        null,
        2,
      ),
    );

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(['version', 'patch', '--manifest', './manifest.json'], {
      from: 'user',
    });

    expect(console.log).toHaveBeenCalledWith('./package-lock.json version updated to 1.2.4');
  });

  it('asks which version to use when versions differ across files', async () => {
    fs.writeFileSync(
      './manifest.json',
      JSON.stringify({ version: '2.0.0', name: 'sample' }, null, 2),
    );
    fs.writeFileSync('./package.json', JSON.stringify({ version: '1.4.0', name: 'pkg' }, null, 2));

    selectMock.mockResolvedValue('1.4.0');

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(['version', 'minor', '--manifest', './manifest.json'], {
      from: 'user',
    });

    const manifestResult = JSON.parse(fs.readFileSync('./manifest.json', 'utf-8'));
    const packageResult = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(manifestResult.version).toBe('1.5.0');
    expect(packageResult.version).toBe('1.5.0');
  });

  it('supports prerelease tagging with --tag', async () => {
    fs.writeFileSync(
      './manifest.json',
      JSON.stringify({ version: '1.2.3', name: 'sample' }, null, 2),
    );

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(
      ['version', 'prerelease', '--tag', 'beta', '--manifest', './manifest.json'],
      { from: 'user' },
    );

    const manifestResult = JSON.parse(fs.readFileSync('./manifest.json', 'utf-8'));
    expect(manifestResult.version).toBe('1.2.4-beta.0');
  });

  it('fails when explicit version is used with --tag', async () => {
    fs.writeFileSync(
      './manifest.json',
      JSON.stringify({ version: '1.2.3', name: 'sample' }, null, 2),
    );

    const program = new Command();
    versionCommand(program);

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined): never => {
        throw new Error(`process.exit:${code}`);
      });

    await expect(
      program.parseAsync(['version', '2.0.0', '--tag', 'beta', '--manifest', './manifest.json'], {
        from: 'user',
      }),
    ).rejects.toThrow('process.exit:1');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('updates all manifests when multiple --manifest paths are given', async () => {
    fs.writeFileSync(
      './manifest.dev.json',
      JSON.stringify({ version: '1.2.3', name: 'dev' }, null, 2),
    );
    fs.writeFileSync(
      './manifest.prod.json',
      JSON.stringify({ version: '1.2.3', name: 'prod' }, null, 2),
    );

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(
      ['version', 'patch', '--manifest', './manifest.dev.json', './manifest.prod.json'],
      { from: 'user' },
    );

    const devResult = JSON.parse(fs.readFileSync('./manifest.dev.json', 'utf-8'));
    const prodResult = JSON.parse(fs.readFileSync('./manifest.prod.json', 'utf-8'));

    expect(devResult.version).toBe('1.2.4');
    expect(prodResult.version).toBe('1.2.4');
  });
});
