import { loadEnvironment } from '../configs/loadEnvironment';
import { createDatabase } from '../configs/database';
import { LocalStorage } from '../providers/storage/local.storage';
import { AttachmentService } from '../services/attachment.service';

async function main() {
  const config = loadEnvironment(); const db = createDatabase(config.databaseUrl);
  try {
    const result = await new AttachmentService(db.prisma!, new LocalStorage(config.storageRoot), config.ffprobePath).cleanup();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await db.disconnect(); }
}
if (require.main === module) void main().catch(() => { process.stderr.write('Attachment cleanup failed. Check database and storage availability.\n'); process.exitCode = 1; });
