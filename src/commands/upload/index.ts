import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import kleur from 'kleur';
import { loadEnv, loadEnvConfig } from "../../utils/env";
import { getAccessToken } from "../../utils/oauth";
import { parseStoreError } from "../../utils/chrome-webstore";
import type { StoreTarget, UploadResponse, UploadState } from "../../types";

export function uploadCommand(program: Command) {
  program
    .command('upload')
    .description('upload the extension zip archive to the server')
    .argument('<release-zip-path>', 'extension zip file to upload (e.g., releases/my-extension.zip)')
    .option('-e, --env <path>', 'custom path to .env file (e.g., --env .env.production)')
    .action(async (releaseZipPath: string, options: { env?: string }) => {
      try {
        const absoluteReleaseZipPath = path.resolve(releaseZipPath);
        if (!fs.existsSync(absoluteReleaseZipPath)) {
          throw new Error(`release zip file '${releaseZipPath}' does not exist`);
        }

        console.log(`--- uploading '${releaseZipPath}' to the server ---`);

        loadEnvConfig(options.env);
        const config = loadEnv();

        console.log('  obtaining access token using refresh token...');
        const accessToken = await getAccessToken(config);
        console.log(`${kleur.green('✔')} obtained access token`);

        console.log('  uploading the package...');
        const result = await uploadChromeWebStoreV2(absoluteReleaseZipPath, config, accessToken);
        console.log(`${kleur.green('✔')} upload succeeded!`);
        console.log(`  extension_id: ${result.itemId}`);
        console.log(`  version: ${result.crxVersion}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message.replace(/^Error:\s*/, '') : String(error);
        console.error(kleur.red(`✖ error: ${msg}`));
        process.exit(1);
      }
    });
}

export async function uploadChromeWebStoreV2(
  zipFilePath: string,
  target: StoreTarget,
  accessToken: string
): Promise<UploadResponse> {
  const zipBuffer = fs.readFileSync(zipFilePath);

  const url = `https://chromewebstore.googleapis.com/upload/v2/publishers/${target.publisherId}/items/${target.extensionId}:upload`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/zip',
    },
    body: zipBuffer,
  });

  let result: Record<string, unknown>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`upload failed (HTTP ${response.status} ${response.statusText})`);
  }

  if (response.ok && result.uploadState === 'SUCCEEDED') {
    return {
      itemId: result.itemId as string,
      crxVersion: result.crxVersion as string,
      name: result.name as string,
      uploadState: result.uploadState as UploadState
    } as UploadResponse;
  }

  throw new Error(
    parseStoreError(result, `upload failed (HTTP ${response.status} ${response.statusText})`)
  );
}