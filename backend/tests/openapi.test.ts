import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import SwaggerParser from '@apidevtools/swagger-parser';
import request from 'supertest';
import { createApp } from '../src/app';
import { openapi } from '../src/docs/openapi';
import { config, fakeDatabase, captureLogger } from './helpers';
test('OpenAPI validates and inventories every feature route; no credentials/configuration in output', async () => {
    await SwaggerParser.validate(JSON.parse(JSON.stringify(openapi)));
    const mounts: Record<string, string> = { attachment: '/messages/drafts/{draftId}/attachments', auth: '/auth', draft: '/messages/drafts', emailVerification: '/auth/email', externalAccess: '/external', health: '/health', inbox: '/messages/inbox', mailbox: '/messages', notification: '/notifications', root: '', schedule: '/messages/schedules', smsWebhook: '/webhooks/smsgate', wahaWebhook: '/webhooks/waha', operations: '/internal/operations' };
    const implemented = new Set<string>();
    for (const [file, base] of Object.entries(mounts)) {
        const source = ts.createSourceFile(file, readFileSync('src/routes/' + file + '.routes.ts', 'utf8'), ts.ScriptTarget.Latest, true);
        const walk = (node: ts.Node) => {
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && ['r', 'router'].includes(node.expression.expression.text) && ['get', 'post', 'put', 'patch', 'delete'].includes(node.expression.name.text) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
                const path = (base + node.arguments[0].text).replace(/:([a-zA-Z]+)/g, '{$1}').replace(/\/$/, '') || '/';
                implemented.add(node.expression.name.text + ' ' + path);
            }
            ts.forEachChild(node, walk);
        };
        walk(source);
    }
    const described = new Set(Object.entries(openapi.paths).flatMap(([path, ops]) => Object.keys(ops).map(method => method + ' ' + path)));
    assert.deepEqual([...described].sort(), [...implemented].sort());
    const json = JSON.stringify(openapi);
    assert.doesNotMatch(json, /postgres(?:ql)?:\/\/|rediss?:\/\/|npg_|SMSGATE_PASSWORD|OTP_PEPPER|api-key/i);
    assert.deepEqual(openapi.servers, [{ url: '/' }]);
});
test('public Swagger is a self-hosted read-only reference, not an API execution console', async () => {
    const app = createApp(config, fakeDatabase(), captureLogger().logger);
    const schema = await request(app).get('/api/openapi.json').expect(200);
    assert.equal(schema.body.info.title, 'Dearly API Reference');
    const html = await request(app).get('/api/docs').expect(200);
    assert.match(html.headers['content-security-policy'], /script-src 'self'/);
    assert.doesNotMatch(html.text, /https?:\/\/|<script>/);
    assert.equal(html.headers['cache-control'], 'no-store');
    const init = await request(app).get('/api/docs/init.js').expect(200);
    assert.match(init.text, /"supportedSubmitMethods":\[\]/);
    assert.match(init.text, /"validatorUrl":null/);
    assert.match(init.text, /"persistAuthorization":false/);
    assert.match(init.text, /"queryConfigEnabled":false/);
    await request(app).get('/api/docs/swagger-ui.css').expect(200);
    await request(app).get('/api/docs/swagger-ui-bundle.js').expect(200);
    await request(app).get('/api/docs/package.json').expect(404);
    await request(app).post('/messages/drafts').send({}).expect(503);
});
