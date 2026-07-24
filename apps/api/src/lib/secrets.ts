import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const INSTANCE_SECRET_FILE = 'instance-secret';

export async function readOrCreateInstanceSecret(dataDir: string): Promise<Buffer> {
  const secretPath = path.join(dataDir, INSTANCE_SECRET_FILE);

  await mkdir(dataDir, { recursive: true });

  try {
    const existing = await readFile(secretPath);
    if (existing.length >= 32) {
      return existing;
    }
  } catch {
    // The file is created below when missing.
  }

  const generated = randomBytes(32);
  await writeFile(secretPath, generated, { mode: 0o600 });
  return generated;
}
