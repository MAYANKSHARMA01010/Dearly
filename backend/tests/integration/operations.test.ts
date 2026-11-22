import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile, utimes, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { OperationsService, operationsLock } from '../../src/services/operations.service';
import { LocalStorage } from '../../src/providers/storage/local.storage';
import { parseEnvironment } from '../../src/configs/env';
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl)
    throw Error('Set isolated AUTH_TEST_DATABASE_URL.');
const schema = 'dearly_ops_test_' + randomUUID().replaceAll('-', '');
const url = new URL(databaseUrl);
url.searchParams.set('schema', schema);
url.searchParams.set('connection_limit', '5');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [], errorFormat: 'minimal' });
const admin = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [], errorFormat: 'minimal' });
test('real PostgreSQL operations lock, safe cleanup, journal/replay and failure recovery', { timeout: 120000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dearly-ops-'));
    try {
        await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await db.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
            for (const folder of readdirSync('prisma/migrations').filter(n => /^\d/.test(n)).sort())
                for (const statement of readFileSync('prisma/migrations/' + folder + '/migration.sql', 'utf8').replace(/^\s*--.*$/gm, '').split(';').filter(s => s.trim()))
                    await tx.$executeRawUnsafe(statement);
        }, { timeout: 30000 });
        const config = parseEnvironment({ NODE_ENV: 'test', DATABASE_URL: url.toString(), STORAGE_ROOT: root });
        const store = new LocalStorage(root);
        const service = new OperationsService(db, config, store);
        let unlock!: () => void, entered!: () => void;
        const held = new Promise<void>(r => unlock = r), ready = new Promise<void>(r => entered = r);
        const lock = operationsLock(url.toString());
        const first = lock(async () => { entered(); await held; });
        await ready;
        await assert.rejects(lock(async () => { }), { code: 'OPERATIONS_BUSY' });
        unlock();
        await first;
        const file = randomUUID();
        await writeFile(join(root, file), 'synthetic orphan');
        const old = new Date(Date.now() - 2 * 86400000);
        await utimes(join(root, file), old, old);
        const id = randomUUID();
        const run = await service.maintenance(id);
        assert.equal(run.state, 'SUCCEEDED');
        assert.equal((run.counts as {
            orphans: number;
        }).orphans, 1);
        assert.equal((await service.maintenance(id)).id, id);
        assert.equal(await db.operationsRun.count({ where: { id } }), 1);
        const brokenStore = new LocalStorage(root);
        brokenStore.entries = async () => { throw Error('sensitive transport body'); };
        const broken = new OperationsService(db, config, brokenStore);
        const failedId = randomUUID();
        await assert.rejects(broken.maintenance(failedId), { code: 'OPERATIONS_FAILED' });
        const failed = await db.operationsRun.findUniqueOrThrow({ where: { id: failedId } });
        assert.equal(failed.state, 'FAILED');
        assert.doesNotMatch(JSON.stringify(failed), /sensitive transport body/);
        assert.equal((await service.maintenance(failedId)).state, 'FAILED');
        const abandoned = randomUUID();
        await db.operationsRun.create({ data: { id: abandoned, state: 'RUNNING', startedAt: new Date(Date.now() - 120000) } });
        await service.maintenance(randomUUID());
        assert.equal((await db.operationsRun.findUniqueOrThrow({ where: { id: abandoned } })).state, 'INTERRUPTED');
        const status = await service.status();
        assert.equal(status.backend.database, 'ready');
        assert.equal(status.waha.status, 'DISABLED');
    }
    finally {
        await db.$disconnect();
        await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.$disconnect();
        await rm(root, { recursive: true, force: true });
    }
});
