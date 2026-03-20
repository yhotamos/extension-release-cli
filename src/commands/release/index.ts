import path from 'node:path';
import fs from 'node:fs';
import kleur from 'kleur';
import type { Command } from "commander";
import { loadEnv, loadEnvConfig } from '../../utils/env';
import { getAccessToken } from '../../utils/oauth';
import { packExtension } from '../pack';
import type { PackOptions } from '../pack';
import { uploadChromeWebStoreV2 } from '../upload';
import { publishChromeWebStoreV2 } from '../publish';
import type { PublishOptions } from '../publish';

type ReleaseOptions = PackOptions & PublishOptions;

export function releaseCommand(program: Command) {
  program
    .command('release')
    .description('pack, upload, and publish the extension in one step')
    .argument('<source>', 'extension source directory with manifest.json to pack (e.g., dist/, my-extension/)')
    .option('-n, --name <name>', 'base name to use for the zip file')
    .option('-r, --releases-dir <dir>', 'directory to save the zip file (default: releases/)')
    .option('-f, --force', 'overwrite existing zip file if it exists')
    .option('--dry-run', 'perform a trial run with no changes made')
    .option('-e, --env <path>', 'custom path to .env file (e.g., --env .env.production)')
    .option('--publish-type <type>', 'publish type (DEFAULT_PUBLISH or STAGED_PUBLISH)', 'DEFAULT_PUBLISH')
    .option('--deploy-percentage <number>', 'percentage of users to deploy to (0-100)', parseFloat)
    .option('--skip-review', 'skip the review process', false)
    .action(async (source: string, options: ReleaseOptions) => {
      try {
        if (!fs.existsSync(source)) {
          throw new Error(`source directory '${source}' does not exist`);
        }
        console.log(`--- releasing ---\n`);

        // pack
        const header = `--- [1/3] packing '${source}' into a zip archive ---`;
        const zipFilePath = await packExtension(source, options, header);

        if (options.dryRun) {
          console.log(`\n${kleur.yellow('⚠')} upload and publish skipped (dry run)`);
          return;
        }

        if (!zipFilePath) {
          throw new Error('packing was not completed. release process aborted.');
        }

        // upload
        console.log(`\n--- [2/3] uploading '${path.basename(zipFilePath)}' to the server ---`);
        loadEnvConfig(options.env);
        const config = loadEnv();

        console.log('  obtaining access token using refresh token...');
        const accessToken = await getAccessToken(config);
        console.log(`${kleur.green('✔')} obtained access token`);

        console.log('  uploading the package...');
        const uploadResult = await uploadChromeWebStoreV2(zipFilePath, config, accessToken);
        console.log(`${kleur.green('✔')} upload succeeded!`);
        console.log(`  extension_id: ${uploadResult.itemId}`);
        console.log(`  version: ${uploadResult.crxVersion}`);

        // publish
        console.log(`\n--- [3/3] publishing the extension ---`);
        console.log('  publishing the extension...');
        const publishResult = await publishChromeWebStoreV2(config, accessToken, {
          publishType: options.publishType,
          deployPercentage: options.deployPercentage,
          skipReview: options.skipReview,
        });
        console.log(`${kleur.green('✔')} publish succeeded!`);
        console.log(`  itemId: ${publishResult.itemId}`);
        console.log(`  state: ${publishResult.state}`);

        console.log(`\n${kleur.green('✔')} release completed successfully!`);
      } catch (error) {
        const msg = error instanceof Error ? error.message.replace(/^Error:\s*/, '') : String(error);
        console.error(kleur.red(`✖ error: ${msg}`));
        process.exit(1);
      }
    });
}