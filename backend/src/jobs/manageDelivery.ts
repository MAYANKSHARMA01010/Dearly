import { loadEnvironment } from '../configs/loadEnvironment';
import { createDatabase } from '../configs/database';
import { LocalStorage } from '../providers/storage/local.storage';
import { DeliveryWorker } from '../workers/deliveryWorker';
import { workerStatus } from '../services/workerStatus.service';
import { z } from 'zod';
async function main() {
  const config = loadEnvironment(),
    db = createDatabase(config.databaseUrl);
  try {
    const args = process.argv.slice(2);
    if (args[0] === 'retry') {
      const id = z.string().uuid().safeParse(args[1]);
      if (args.length !== 2 || !id.success) throw Error();
      const retried = await new DeliveryWorker(
        db.prisma!,
        new LocalStorage(config.storageRoot),
      ).retry(id.data);
      process.stdout.write(`${JSON.stringify({ retried })}\n`);
      if (!retried) process.exitCode = 1;
    } else if (!args.length) {
      const counts = await db.prisma!.deliveryWork.groupBy({
        by: ['state'],
        _count: true,
      });
      const failed = await db.prisma!.deliveryWork.findMany({
        where: { state: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          attempts: true,
          attemptLimit: true,
          lastError: true,
        },
      });
      process.stdout.write(
        `${JSON.stringify({ worker: await workerStatus(db.prisma), counts: counts.map((c) => ({ state: c.state, count: c._count })), failed })}\n`,
      );
    } else throw Error();
  } finally {
    await db.disconnect();
  }
}
if (require.main === module)
  void main().catch(() => {
    process.stderr.write(
      'Delivery operation failed. Use delivery:status or delivery:retry -- <work UUID>; check database availability.\n',
    );
    process.exitCode = 1;
  });
