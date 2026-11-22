import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createOperationsRouter } from '../src/routes/operations.routes';
import { OperationsService } from '../src/services/operations.service';
import { errorHandler } from '../src/middlewares/errorHandler';
import { requestContext } from '../src/middlewares/requestContext';
import { parseEnvironment } from '../src/configs/env';
import { config, captureLogger } from './helpers';
import type { PrismaClient } from '@prisma/client';
import type { ObjectStore } from '../src/providers/storage/local.storage';
const write = 'a'.repeat(64), read = 'b'.repeat(64), id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
test('operations credentials are separate, optional, fail closed and do not invoke work on bad input', async () => {
    let runs = 0, reads = 0;
    const log = captureLogger();
    const app = express();
    app.use(requestContext(log.logger), express.json());
    app.use('/ops', createOperationsRouter({ ...config, operationsToken: write, monitoringToken: read }, undefined, { async maintenance(run) { runs++; return { id: run, state: 'SUCCEEDED' } as never; }, async status() { reads++; return {} as never; } }));
    app.use(errorHandler(log.logger));
    await request(app).post('/ops/maintenance').send({}).expect(401);
    await request(app).post('/ops/maintenance').set('Authorization', 'Bearer ' + read).send({}).expect(401);
    await request(app).get('/ops/status').set('Authorization', 'Bearer ' + write).expect(401);
    await request(app).post('/ops/maintenance').set('Authorization', 'Bearer ' + write).set('X-Operations-Run', id).send({ command: 'send' }).expect(400);
    assert.equal(runs, 0);
    assert.equal(reads, 0);
    const r = await request(app).post('/ops/maintenance').set('Authorization', 'Bearer ' + write).set('X-Operations-Run', id).send({}).expect(200);
    assert.equal(r.body.data.id, id);
    assert.equal(r.headers['cache-control'], 'private, no-store');
    await request(app).get('/ops/status').set('Authorization', 'Bearer ' + read).expect(200);
    assert.equal(runs, 1);
    assert.equal(reads, 1);
    assert.doesNotMatch(JSON.stringify(log.entries), new RegExp(write + '|' + read));
    assert.throws(() => parseEnvironment({ DATABASE_URL: config.databaseUrl, OPERATIONS_TOKEN: write, MONITORING_TOKEN: write }));
    const disabled = express();
    disabled.use(createOperationsRouter(config));
    disabled.use(errorHandler(log.logger));
    await request(disabled).get('/status').expect(503);
});
test('maintenance uses bounded batches and immutable journal IDs; partial failure remains failed', async () => {
    let saved: Record<string, unknown> | null = null, fail = false, cleanup = 0;
    const limits: number[] = [];
    const empty = { async findMany(q: {
            take: number;
        }) { limits.push(q.take); return []; }, async deleteMany() { return { count: 0 }; }, async updateMany() { return { count: 0 }; } };
    const db = { operationsRun: { ...empty, async findUnique() { return saved; }, async create(q: {
                data: Record<string, unknown>;
            }) { saved = q.data; return saved; }, async update(q: {
                data: Record<string, unknown>;
            }) { saved = { ...saved, ...q.data }; return saved; } }, attachment: { ...empty, async findMany(q: {
                take: number;
            }) { cleanup++; limits.push(q.take); if (fail)
                throw Error('private payload'); return []; } }, wahaReceipt: empty, smsReceipt: empty, async $queryRaw() { return [{ now: new Date() }]; } } as unknown as PrismaClient;
    const store = { async entries() { return []; } } as unknown as ObjectStore;
    const service = new OperationsService(db, config, store, async (work) => work(new AbortController().signal));
    assert.equal((await service.maintenance(id)).state, 'SUCCEEDED');
    await service.maintenance(id);
    assert.equal(cleanup, 1);
    assert.ok(limits.every(n => n <= 100));
    assert.ok(limits.includes(10));
    saved = null;
    fail = true;
    await assert.rejects(service.maintenance(id), { code: 'OPERATIONS_FAILED' });
    assert.equal((saved as Record<string, unknown> | null)?.state, 'FAILED');
    assert.equal((await service.maintenance(id)).state, 'FAILED');
    assert.equal(cleanup, 2);
    assert.doesNotMatch(JSON.stringify(saved), /private payload/);
});
