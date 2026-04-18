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
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    selectMock.mockReset();
  });

  it('bumps patch version and syncs manifest/package versions', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'exr-version-'));
    const manifestPath = path.join(workspace, 'manifest.json');
    const packagePath = path.join(workspace, 'package.json');

    fs.writeFileSync(manifestPath, JSON.stringify({ version: '1.2.3', name: 'sample' }, null, 2));
    fs.writeFileSync(packagePath, JSON.stringify({ version: '1.2.3', name: 'pkg' }, null, 2));

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(
      ['version', '--manifest', manifestPath, '--package-path', packagePath],
      { from: 'user' },
    );

    const manifestResult = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const packageResult = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

    expect(manifestResult.version).toBe('1.2.4');
    expect(packageResult.version).toBe('1.2.4');
  });

  it('asks which version to use when manifest and package versions differ', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'exr-version-'));
    const manifestPath = path.join(workspace, 'manifest.json');
    const packagePath = path.join(workspace, 'package.json');

    fs.writeFileSync(manifestPath, JSON.stringify({ version: '2.0.0', name: 'sample' }, null, 2));
    fs.writeFileSync(packagePath, JSON.stringify({ version: '1.4.0', name: 'pkg' }, null, 2));

    selectMock.mockResolvedValue('package');

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(
      ['version', 'minor', '--manifest', manifestPath, '--package-path', packagePath],
      { from: 'user' },
    );

    const manifestResult = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const packageResult = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(manifestResult.version).toBe('1.5.0');
    expect(packageResult.version).toBe('1.5.0');
  });

  it('supports prerelease tagging with --tag', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'exr-version-'));
    const manifestPath = path.join(workspace, 'manifest.json');
    const packagePath = path.join(workspace, 'missing-package.json');

    fs.writeFileSync(manifestPath, JSON.stringify({ version: '1.2.3', name: 'sample' }, null, 2));

    const program = new Command();
    versionCommand(program);

    await program.parseAsync(
      [
        'version',
        'prerelease',
        '--tag',
        'beta',
        '--manifest',
        manifestPath,
        '--package-path',
        packagePath,
      ],
      {
        from: 'user',
      },
    );

    const manifestResult = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifestResult.version).toBe('1.2.4-beta.0');
  });

  it('fails when explicit version is used with --tag', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'exr-version-'));
    const manifestPath = path.join(workspace, 'manifest.json');

    fs.writeFileSync(manifestPath, JSON.stringify({ version: '1.2.3', name: 'sample' }, null, 2));

    const program = new Command();
    versionCommand(program);

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined): never => {
        throw new Error(`process.exit:${code}`);
      });

    await expect(
      program.parseAsync(['version', '2.0.0', '--tag', 'beta', '--manifest', manifestPath], {
        from: 'user',
      }),
    ).rejects.toThrow('process.exit:1');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
