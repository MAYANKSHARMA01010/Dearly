import { loadEnvironment } from '../configs/loadEnvironment';
import { createDatabase } from '../configs/database';
import { createObjectStore } from '../providers/storage/createObjectStore';
import { AttachmentService } from '../services/attachment.service';

async function main() {
  const config = loadEnvironment(); const db = createDatabase(config.databaseUrl);
  try {
    const result = await new AttachmentService(db.prisma!, createObjectStore(config), config.ffprobePath).cleanup();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally { await db.disconnect(); }
}
if (require.main === module) void main().catch(() => { process.stderr.write('Attachment cleanup failed. Check database and storage availability.\n'); process.exitCode = 1; });
