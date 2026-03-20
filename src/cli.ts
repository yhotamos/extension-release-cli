import { Command } from 'commander'
import { readFileSync } from 'fs'
import { packCommand } from './commands/pack';
import { uploadCommand } from './commands/upload';
import { publishCommand } from './commands/publish';
import { releaseCommand } from './commands/release';
import { statusCommand } from './commands/status';

const pkgJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
const version = pkgJson.version;
const author = pkgJson.author.split(' ')[0];
const repositoryUrl = pkgJson.repository?.url.replace(/^git\+/, '') || '';

const program = new Command();

program
  .name('exr')
  .description(pkgJson.description)
  .version(version, '-v, --version', 'output the current version')
  .addHelpText('after', `\nExtension Release CLI v${version}`)
  .addHelpText('after', `Copyright (c) 2026 ${author}`)
  .addHelpText('after', `GitHub: ${repositoryUrl}`)

// Register commands
// pack: create a zip archive of the extension source code, ready for upload or publish
packCommand(program);
// upload: upload the packed extension to the marketplace
uploadCommand(program);
// publish: publish the extension to the marketplace
publishCommand(program);
// release: pack, upload, and publish the extension in one step
releaseCommand(program);
// status: check the status of the extension in the marketplace (e.g., pending publication, published, etc.)
statusCommand(program);

program.parse();
