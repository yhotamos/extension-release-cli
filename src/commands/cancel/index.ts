import type { Command } from 'commander';
import kleur from 'kleur';
import type { StoreTarget } from '../../types';
import { isErrorResponse, parseStoreError } from '../../utils/chrome-webstore';
import { loadEnv, loadEnvConfig } from '../../utils/env';
import { getAccessToken } from '../../utils/oauth';

export type CancelOptions = {
  env?: string;
};

export function cancelCommand(program: Command) {
  program
    .command('cancel')
    .description('cancel the review of a pending extension request in the marketplace')
    .option('-e, --env <path>', 'custom path to .env file (e.g., --env .env.production)')
    .action(async (options: CancelOptions) => {
      try {
        console.log(`--- canceling pending extension request ---`);

        loadEnvConfig(options.env);
        const config = loadEnv();

        console.log('  obtaining access token using refresh token...');
        const accessToken = await getAccessToken(config);
        console.log(`${kleur.green('✔')} obtained access token`);

        console.log('  canceling pending extension request...');
        await cancelPendingExtensionRequest(config, accessToken);
        console.log(`${kleur.green('✔')} cancellation succeeded!`);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message.replace(/^Error:\s*/, '') : String(error);
        console.error(kleur.red(`✖ error: ${msg}`));
        process.exit(1);
      }
    });
}

export async function cancelPendingExtensionRequest(
  target: StoreTarget,
  accessToken: string,
): Promise<void> {
  const url = `https://chromewebstore.googleapis.com/v2/publishers/${target.publisherId}/items/${target.extensionId}:cancelSubmission`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.ok) {
    return;
  }

  const fallback = `failed to cancel pending extension request (HTTP ${response.status} ${response.statusText})`;

  try {
    const result: unknown = await response.json();

    if (isErrorResponse(result)) {
      throw new Error(parseStoreError(result, fallback));
    }
  } catch (e) {
    if (e instanceof Error) throw e;
  }

  throw new Error(fallback);
}
