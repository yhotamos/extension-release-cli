import type { Command } from 'commander';
import kleur from 'kleur';
import type { ItemState, StoreTarget, UploadState } from '../../types';
import { loadEnv, loadEnvConfig } from '../../utils/env';
import { getAccessToken } from '../../utils/oauth';

export type StatusOptions = {
  env?: string;
  showFullPublicKey?: boolean;
};

// Deployment information for a specific release channel
type DistributionChannel = {
  deployPercentage: number;
  crxVersion: string;
};

// Details on the status of an item revision
type ItemRevisionStatus = {
  state: ItemState;
  distributionChannels: DistributionChannel[];
};

type StatusResponse = {
  name: string;
  itemId: string;
  publicKey: string | undefined;
  publishedItemRevisionStatus: ItemRevisionStatus | undefined;
  submittedItemRevisionStatus: ItemRevisionStatus | undefined;
  lastAsyncUploadState: UploadState | undefined;
  takenDown: boolean;
  warned: boolean;
};

export function statusCommand(program: Command) {
  program
    .command('status')
    .description(
      'check the status of the extension in the marketplace (e.g., pending publication, published, etc.)',
    )
    .option('-e, --env <path>', 'custom path to .env file (e.g., --env .env.production)')
    .option('--show-full-public-key', 'show full public key in the output')
    .action(async (options: StatusOptions) => {
      try {
        console.log('--- checking extension status ---');
        loadEnvConfig(options.env);
        const config = loadEnv();

        console.log('  obtaining access token using refresh token...');
        const accessToken = await getAccessToken(config);
        console.log(`${kleur.green('✔')} obtained access token`);

        const response = await fetchWebStoreStatus(config, accessToken);
        const data = await response.json();

        if (!response.ok) {
          const errorMsg = data.error?.message || `HTTP ${response.status}`;
          throw new Error(`failed to fetch status: ${errorMsg}`);
        }

        showStatus(data, options);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message.replace(/^Error:\s*/, '') : String(error);
        console.error(kleur.red(`✖ error: ${msg}`));
        process.exit(1);
      }
    });
}

async function fetchWebStoreStatus(target: StoreTarget, accessToken: string): Promise<Response> {
  const url = `https://chromewebstore.googleapis.com/v2/publishers/${target.publisherId}/items/${target.extensionId}:fetchStatus`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return response;
}

function showStatus(status: StatusResponse, options: StatusOptions): void {
  console.log(`  Extension ID: ${status.itemId}`);
  console.log(
    `  Public Key: ${options.showFullPublicKey ? status.publicKey : shortenPublicKey(status.publicKey)}`,
  );
  console.log(`  Taken Down: ${status.takenDown ? 'Yes' : 'No'}`);
  console.log(`  Warned: ${status.warned ? 'Yes' : 'No'}`);
  console.log(
    `  Last Async Upload State: ${status.lastAsyncUploadState || '(24h upload not found)'}`,
  );

  if (status.publishedItemRevisionStatus) {
    console.log(`  Published Revision State: ${status.publishedItemRevisionStatus.state}`);
    status.publishedItemRevisionStatus.distributionChannels.forEach((channel, index) => {
      console.log(`    Distribution Channel ${index + 1}:`);
      console.log(`      Deploy Percentage: ${channel.deployPercentage}%`);
      console.log(`      CRX Version: ${channel.crxVersion}`);
    });
  } else {
    console.log('  No published item revision status available.');
  }

  if (status.submittedItemRevisionStatus) {
    console.log(`  Submitted Revision State: ${status.submittedItemRevisionStatus.state}`);
    status.submittedItemRevisionStatus.distributionChannels.forEach((channel, index) => {
      console.log(`    Distribution Channel ${index + 1}:`);
      console.log(`      Deploy Percentage: ${channel.deployPercentage}%`);
      console.log(`      CRX Version: ${channel.crxVersion}`);
    });
  } else {
    console.log('  No submitted item revision status available.');
  }
}

function shortenPublicKey(key: string | undefined): string {
  if (!key) return '';
  key = key.trim();
  const begin = '-----BEGIN PUBLIC KEY-----';
  const end = '-----END PUBLIC KEY-----';

  if (key.startsWith(begin) && key.endsWith(end)) {
    const lines = key.split('\n').filter((line) => line.trim() !== '');
    if (lines.length >= 4) {
      const firstLine = lines[1].slice(0, 10);
      const lastLine = lines[lines.length - 2].slice(-10);
      return `${begin}\n${firstLine}... (omitted) ...${lastLine}\n${end}`;
    }
  }

  return key;
}
