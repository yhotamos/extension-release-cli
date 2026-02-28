import { Command } from 'commander'
import { readFileSync } from 'fs'
import { packCommand } from './commands/pack';

const pkgJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));

const program = new Command();

program
  .name('exr')
  .description(pkgJson.description)
  .version(pkgJson.version, '-v, --version', 'output the current version');

// Register commands
// pack: create a zip archive of the extension source code, ready for upload or publish
packCommand(program);
// upload: upload the packed extension to the marketplace (requires API key)
// publish: upload and publish the extension in one step (requires API key)

program.parse();
