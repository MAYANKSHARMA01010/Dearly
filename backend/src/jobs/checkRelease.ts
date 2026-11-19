import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvironment } from '../configs/loadEnvironment';
import { releaseIssues } from '../services/release.service';
try {
  const c = loadEnvironment(),
    issues = releaseIssues(c, {
      persistentStorage: process.env.PERSISTENT_STORAGE_CONFIRMED === 'true',
      backupKey: process.env.BACKUP_ENCRYPTION_KEY,
      smsCallback: process.env.SMSGATE_CALLBACK_URL,
    });
  if (existsSync(join(c.storageRoot, '.restore-review-required')))
    issues.push('RESTORE_REVIEW_REQUIRED');
  console.log(JSON.stringify({ ready: issues.length === 0, issues }));
  if (issues.length) process.exitCode = 1;
} catch {
  console.error(
    'Release configuration invalid. Inspect private environment fields; no values were logged.',
  );
  process.exitCode = 1;
}
