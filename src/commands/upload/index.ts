import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import kleur from 'kleur';
import { loadEnv, loadEnvConfig } from "./env";

type APIClient = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

type Store = {
  publisherId: string;
  extensionId: string;
}

export interface UploadConfig extends APIClient, Store { }

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

        await uploadChromeWebStoreV2(absoluteReleaseZipPath);
      } catch (error) {
        const msg = error instanceof Error ? error.message.replace(/^Error:\s*/, '') : String(error);
        console.error(kleur.red(`✖ error: ${msg}`));
        process.exit(1);
      }
    });
}

/**
 * Uploads the extension zip file to the Chrome Web Store using the V2 API.
 */
async function uploadChromeWebStoreV2(
  zipFilePath: string,
  config: UploadConfig = loadEnv()
): Promise<void> {
  const missing: string[] = [];

  if (!config.clientId) missing.push('clientId');
  if (!config.clientSecret) missing.push('clientSecret');
  if (!config.refreshToken) missing.push('refreshToken');
  if (!config.publisherId) missing.push('publisherId');
  if (!config.extensionId) missing.push('extensionId');

  if (missing.length > 0) {
    throw new Error(`missing configuration "${missing.join(', ')}"`);
  }

  // obtaining access token using refresh token
  console.log('  obtaining access token using refresh token...');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId!,
      client_secret: config.clientSecret!,
      refresh_token: config.refreshToken!,
      grant_type: 'refresh_token',
    }),
  });
  const tokenJson = await tokenResponse.json();

  if (!tokenResponse.ok) {
    throw new Error(
      `failed to obtain access token (HTTP ${tokenResponse.status} ${tokenResponse.statusText})`
    );
  }

  const accessToken = tokenJson.access_token as string | undefined;

  if (!accessToken) {
    throw new Error(`failed to obtain access token (missing access_token in response)`);
  }

  console.log(`${kleur.green('✔')} obtained access token`);

  // uploading the package (V2 media.upload)
  console.log('  uploading the package...');
  const zipBuffer = fs.readFileSync(zipFilePath);

  const uploadUrl = `https://chromewebstore.googleapis.com/upload/v2/publishers/${config.publisherId}/items/${config.extensionId}:upload`;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/zip',
    },
    body: zipBuffer,
  });

  let uploadResult;

  try {
    uploadResult = await uploadResponse.json();
  } catch {
    throw new Error(`upload failed (HTTP ${uploadResponse.status} ${uploadResponse.statusText})`);
  }

  // success check
  if (uploadResponse.ok && uploadResult && uploadResult.uploadState === 'SUCCEEDED') {
    console.log(`${kleur.green('✔')} upload succeeded!`);
    console.log(`  extension_id: ${uploadResult.itemId}`);
    console.log(`  version: ${uploadResult.crxVersion}`);
    return;
  }

  // error parsing and formatting for user friendly display
  if (uploadResult && uploadResult.error) {
    const err = uploadResult.error;
    const messages: string[] = [];

    if (err.message) messages.push(err.message);

    if (Array.isArray(err.details)) {
      for (const d of err.details) {
        const type = d['@type'] || d.typeUrl || '';
        if (type.includes('BadRequest') && Array.isArray(d.fieldViolations)) {
          for (const fv of d.fieldViolations) {
            if (fv.description) messages.push(fv.description);
          }
        } else if (type.includes('LocalizedMessage') && d.message) {
          messages.push(d.message);
        } else if (type.includes('ErrorInfo') && d.reason) {
          messages.push(`reason: ${d.reason}`);
        }
      }
    }

    const friendly = messages.length > 0 ? messages.join('\n  ') : `upload failed "${JSON.stringify(err)}"`;
    throw new Error(friendly);
  }

  // fallback for unknown error format
  throw new Error(`upload failed "HTTP ${uploadResponse.status} ${uploadResponse.statusText}"`);
}