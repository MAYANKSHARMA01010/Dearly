import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
/** Protected deployment identity; no user records or environment dump. */
export function releaseIdentity() {
  const root = join(__dirname, '../..');
  const migrations = readdirSync(join(root, 'prisma/migrations')).filter(n => /^\d/.test(n)).sort().map(name => ({ name, checksum: createHash('sha256').update(readFileSync(join(root, 'prisma/migrations', name, 'migration.sql'))).digest('hex') }));
  const commit = process.env.RENDER_GIT_COMMIT;
  return {
    version: (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version,
    commit: /^[a-f0-9]{40}$/.test(commit ?? '') ? commit : null,
    migrations: createHash('sha256').update(JSON.stringify(migrations)).digest('hex'),
  };
}
