import type { Prisma, PrismaClient } from '@prisma/client';
export async function databaseTime(
  db: PrismaClient | Prisma.TransactionClient,
) {
  const rows = await db.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  return rows[0].now;
}
