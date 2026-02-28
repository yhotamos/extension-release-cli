import { Command } from "commander";

function pack(source: string): void {
  console.log(`Packing ${source}...`);
}

export function packCommand(program: Command) {
  program
    .command('pack')
    .description('Pack the source file or directory into a zip archive')
    .argument('<source>', 'source file or directory to pack (e.g., dist/)')
    .action(pack);
}