import { resolve } from 'node:path';
import { loadEnvironment } from '../configs/loadEnvironment';
import { createObjectStore } from '../providers/storage/createObjectStore';
import { BackupService } from '../services/backup.service';
async function main() {
  const c = loadEnvironment(),
    [action, path, confirmation] = process.argv.slice(2),
    key = process.env.BACKUP_ENCRYPTION_KEY ?? '';
  if (!path || process.argv.length !== 5)
    throw Error(
      'Use create FILE --writers-stopped or restore FILE --confirm-empty-target.',
    );
  const service = new BackupService();
  if (action === 'create' && confirmation === '--writers-stopped')
    console.log(
      JSON.stringify(
        await service.create(
          c.databaseUrl,
          resolve(c.storageRoot),
          resolve(path),
          key,
          c.remoteStorage ? createObjectStore(c) : undefined,
        ),
      ),
    );
  else if (
    action === 'restore' &&
    confirmation === '--confirm-empty-target' &&
    process.env.RESTORE_DATABASE_URL &&
    process.env.RESTORE_STORAGE_ROOT
  )
    console.log(
      JSON.stringify(
        await service.restore(
          resolve(path),
          process.env.RESTORE_DATABASE_URL,
          resolve(process.env.RESTORE_STORAGE_ROOT),
          c.databaseUrl,
          resolve(c.storageRoot),
          key,
        ),
      ),
    );
  else
    throw Error(
      'Explicit offline restore targets and confirmation are required.',
    );
}
void main().catch(() => {
  console.error(
    'Backup/restore stopped. Check private configuration, empty target, encryption key and tool versions; no data or credentials were logged.',
  );
  process.exitCode = 1;
});
