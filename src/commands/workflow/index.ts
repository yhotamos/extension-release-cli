import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import kleur from 'kleur';

type Platform = 'github';
type Marketplace = 'chrome-web-store';

type WorkflowOptions = {
  marketplace: Marketplace;
  filename?: string;
};

type WorkflowTemplate = {
  workflowFileName: string;
  templatePath: string;
  outputPath: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const platformMap: Record<Platform, string> = {
  github: 'GitHub Actions',
};

const marketplaceObj: Record<Marketplace, { name: string; template: string }> = {
  'chrome-web-store': {
    name: 'Chrome Web Store',
    template: 'chrome-publish.yml',
  },
};

export function workflowCommand(program: Command) {
  program
    .command('workflow')
    .description('generate GitHub Actions workflow file for extension release automation')
    .argument('<platform>', 'target platform for the workflow (e.g., github)')
    .option('--marketplace <name>', 'target marketplace for the workflow', 'chrome-web-store')
    .option('-f, --filename <filename>', 'workflow file name (with extension)')
    .action(async (platform: Platform, options: WorkflowOptions) => {
      try {
        const platformName = getPlatformName(platform);
        const marketplaceName = getMarketplaceName(options.marketplace);
        console.log(`--- generating ${platformName} workflow file for ${marketplaceName} ---`);

        if (isGitHub(platform)) {
          const { workflowFileName, templatePath, outputPath } = getGitHubWorkflowPath(
            options.marketplace,
            options.filename,
          );

          console.log(`  setup workflow file: ${workflowFileName}`);

          copyTemplateToOutput({ workflowFileName, templatePath, outputPath });
          console.log(kleur.green(`✓ workflow file generated at '${outputPath}'`));
        }
      } catch (error) {
        const msg =
          error instanceof Error ? error.message.replace(/^Error:\s*/, '') : String(error);
        console.error(kleur.red(`✖ error: ${msg}`));
        process.exit(1);
      }
    });
}

function copyTemplateToOutput(workflowTemplate: WorkflowTemplate): void {
  const { templatePath, outputPath } = workflowTemplate;
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.copyFileSync(templatePath, path.join(process.cwd(), outputPath));
}

function getGitHubWorkflowPath(
  marketplace: Marketplace,
  workflowFileName: string | undefined,
): WorkflowTemplate {
  const templateName = marketplaceObj[marketplace]?.template;
  if (!templateName) {
    throw new Error(`no workflow template found for marketplace '${marketplace}'`);
  }
  const resolvedWorkflowFileName: string = resolveWorkflowFileName(workflowFileName, templateName);

  return {
    workflowFileName: resolvedWorkflowFileName,
    templatePath: path.join(__dirname, templateName),
    outputPath: path.join('.github', 'workflows', resolvedWorkflowFileName),
  };
}

function isGitHub(platform: Platform): boolean {
  return platform === 'github';
}

function getMarketplaceName(marketplace: Marketplace): string {
  const name = marketplaceObj[marketplace]?.name;
  if (!name) {
    throw new Error(
      `unsupported marketplace '${marketplace}'. Supported marketplaces are: ${Object.keys(marketplaceObj).join(', ')}`,
    );
  }

  return name;
}

function getPlatformName(platform: Platform) {
  const name = platformMap[platform];
  if (!name) {
    throw new Error(
      `unsupported platform '${platform}'. Supported platforms are: ${Object.keys(platformMap).join(', ')}`,
    );
  }

  return name;
}

function resolveWorkflowFileName(filename: string | undefined, fallback: string): string {
  if (!filename) return fallback;

  const ext = path.extname(filename);
  if (ext !== '.yml' && ext !== '.yaml') {
    throw new Error(`workflow file name must have .yml or .yaml extension`);
  }

  return filename;
}
