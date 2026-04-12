import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packCommand } from './index';

vi.mock('../../utils/manifest', () => ({
  getManifestData: () => ({ name: 'test-extension', version: '1.2.3' }),
}));

vi.mock('archiver', () => {
  return {
    default: () => {
      let outputRef: (NodeJS.WritableStream & NodeJS.EventEmitter) | null = null;
      return {
        directory: vi.fn(),
        glob: vi.fn(),
        pipe: (o: NodeJS.WritableStream & NodeJS.EventEmitter) => {
          outputRef = o;
        },
        finalize: () => {
          setImmediate(() => outputRef?.emit('close'));
        },
        on: vi.fn(),
        removeAllListeners: vi.fn(),
        pointer: () => 2048,
      };
    },
  };
});

describe('pack command', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires source argument', async () => {
    const program = new Command();
    packCommand(program);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined): never => {
        throw new Error(`process.exit:${code}`);
      });
    await expect(
      program.parseAsync(['pack', '--releases-dir', 'some-dir'], { from: 'user' }),
    ).rejects.toThrow('process.exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('packs an existing source directory into a zip archive', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-src-'));
    fs.writeFileSync(path.join(tmpDir, 'dummy.txt'), 'hello');
    const releasesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-releases-'));

    const events = await import('node:events');
    const fakeStream = new events.EventEmitter() as unknown as fs.WriteStream;
    const createWriteSpy = vi.spyOn(fs, 'createWriteStream').mockImplementation(() => fakeStream);

    const program = new Command();
    packCommand(program);

    await program.parseAsync(['pack', tmpDir, '--releases-dir', releasesDir], { from: 'user' });

    expect(createWriteSpy).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(releasesDir, { recursive: true, force: true });
    } catch {}
  });

  it('dry-run does not create files and reports expected size', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-src-'));
    fs.writeFileSync(path.join(tmpDir, 'dummy.txt'), 'hello');
    const releasesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-releases-'));

    const events = await import('node:events');
    const fakeStream = new events.EventEmitter() as unknown as fs.WriteStream;
    const createWriteSpy = vi.spyOn(fs, 'createWriteStream').mockImplementation(() => fakeStream);

    const program = new Command();
    packCommand(program);

    await program.parseAsync(['pack', tmpDir, '--releases-dir', releasesDir, '--dry-run'], {
      from: 'user',
    });

    expect(createWriteSpy).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(releasesDir, { recursive: true, force: true });
    } catch {}
  });

  it('refuses when releases directory is inside the source directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-src-'));
    fs.writeFileSync(path.join(tmpDir, 'dummy.txt'), 'hello');
    const releasesDir = path.join(tmpDir, 'releases');

    const program = new Command();
    packCommand(program);

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined): never => {
        throw new Error(`process.exit:${code}`);
      });

    await expect(
      program.parseAsync(['pack', tmpDir, '--releases-dir', releasesDir], { from: 'user' }),
    ).rejects.toThrow('process.exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });
});

describe('resolvePackZipFileName', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns the custom name when --name is provided', async () => {
    const manifestModule = await import('../../utils/manifest');
    vi.spyOn(manifestModule, 'getManifestData').mockReturnValue({ name: '', version: '1.2.3' });
    const { resolvePackZipFileName } = await import('./index');
    const { zipFileName } = resolvePackZipFileName('src', { name: 'custom-out' });
    expect(zipFileName).toBe('custom-out-1.2.3.zip');
  });

  it('throws an error when --name is invalid', async () => {
    const manifestModule = await import('../../utils/manifest');
    vi.spyOn(manifestModule, 'getManifestData').mockReturnValue({ name: '', version: '1.2.3' });
    const { resolvePackZipFileName } = await import('./index');
    expect(() => resolvePackZipFileName('src', { name: 'My Extension!! 日本語' })).toThrow(
      /invalid --name value/i,
    );
  });

  it('uses the name from package.json when available (sanitized)', async () => {
    const manifestModule = await import('../../utils/manifest');
    vi.spyOn(manifestModule, 'getManifestData').mockReturnValue({ name: '', version: '1.2.3' });
    vi.spyOn(fs, 'existsSync').mockImplementation(() => true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() =>
      JSON.stringify({ name: 'pkg-name_123', version: '9.8.7' }),
    );
    const { resolvePackZipFileName, sanitizeName } = await import('./index');
    const { zipFileName } = resolvePackZipFileName('src', {});
    expect(zipFileName).toBe(`${sanitizeName('pkg-name_123')}-1.2.3.zip`);
  });

  it('uses the directory name when package.json is not available', async () => {
    const manifestModule = await import('../../utils/manifest');
    vi.spyOn(manifestModule, 'getManifestData').mockReturnValue({ name: '', version: '1.2.3' });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(process, 'cwd').mockReturnValue('/path/to/my-project');
    const { resolvePackZipFileName, sanitizeName } = await import('./index');
    const { zipFileName } = resolvePackZipFileName('src', {});
    expect(zipFileName).toBe(`${sanitizeName('my-project')}-1.2.3.zip`);
  });

  it('falls back to the manifest name as the last resort', async () => {
    const manifestModule = await import('../../utils/manifest');
    vi.spyOn(manifestModule, 'getManifestData').mockReturnValue({
      name: 'MyManifest',
      version: '0.0.1',
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(process, 'cwd').mockReturnValue('/path/日本語');
    const { resolvePackZipFileName, sanitizeName } = await import('./index');
    const { zipFileName } = resolvePackZipFileName('src', {});
    expect(zipFileName).toBe(`${sanitizeName('MyManifest')}-0.0.1.zip`);
  });
});
