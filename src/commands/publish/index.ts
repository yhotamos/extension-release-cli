import type { Command } from 'commander';
import kleur from 'kleur';
import type { PublishParams, PublishResponse, PublishType, StoreTarget } from '../../types';
import { parseStoreError } from '../../utils/chrome-webstore';
import { loadEnv, loadEnvConfig } from '../../utils/env';
import { getAccessToken } from '../../utils/oauth';

export type PublishOptions = {
  env?: string;
  publishType?: PublishType;
  deployPercentage?: number;
  skipReview?: boolean;
};

export function publishCommand(program: Command) {
  program
    .command('publish')
    .description('publish the extension to the marketplace')
    .option('-e, --env <path>', 'custom path to .env file (e.g., --env .env.production)')
    .option(
      '--publish-type <type>',
      'publish type (DEFAULT_PUBLISH or STAGED_PUBLISH)',
      'DEFAULT_PUBLISH',
    )
    .option('--deploy-percentage <number>', 'percentage of users to deploy to (0-100)', parseFloat)
    .option('--skip-review', 'skip the review process', false)
    .action(async (options: PublishOptions) => {
      try {
        console.log(`--- publishing extension ---`);

        loadEnvConfig(options.env);
        const config = loadEnv();

        console.log('  obtaining access token using refresh token...');
        const accessToken = await getAccessToken(config);
        console.log(`${kleur.green('✔')} obtained access token`);

        console.log('  publishing the extension...');
        const result = await publishChromeWebStoreV2(config, accessToken, {
          publishType: options.publishType,
          deployPercentage: options.deployPercentage,
          skipReview: options.skipReview,
        });
        console.log(`${kleur.green('✔')} publish succeeded!`);
        console.log(`  itemId: ${result.itemId}`);
        console.log(`  state: ${result.state}`);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message.replace(/^Error:\s*/, '') : String(error);
        console.error(kleur.red(`✖ error: ${msg}`));
        process.exit(1);
      }
    });
}

export async function publishChromeWebStoreV2(
  target: StoreTarget,
  accessToken: string,
  params: PublishParams = {},
): Promise<PublishResponse> {
  const url = `https://chromewebstore.googleapis.com/v2/publishers/${target.publisherId}/items/${target.extensionId}:publish`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  let result: Record<string, unknown>;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      `failed to publish the extension (HTTP ${response.status} ${response.statusText})`,
    );
  }

  if (!response.ok) {
    throw new Error(
      parseStoreError(
        result,
        `failed to publish the extension (HTTP ${response.status} ${response.statusText})`,
      ),
    );
  }

  return result as PublishResponse;
}
