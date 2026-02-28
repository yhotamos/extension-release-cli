import fs from 'node:fs'
import kleur from 'kleur'

export function makeDirectoryIfNotExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`${kleur.green('✔')} created directory '${dirPath}'`);
    } catch (err) {
      throw new Error(`failed to create directory '${dirPath}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function deleteFileIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`${kleur.green('✔')} deleted file '${filePath}'`);
    } catch (err) {
      throw new Error(`failed to delete file '${filePath}': ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
