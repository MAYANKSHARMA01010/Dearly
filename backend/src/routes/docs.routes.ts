import { Router } from 'express';
import { join, dirname } from 'node:path';
import { openapi } from '../docs/openapi';
export const docsOptions = { url: '/api/openapi.json', dom_id: '#swagger-ui', deepLinking: true, docExpansion: 'none', filter: true, supportedSubmitMethods: [], tryItOutEnabled: false, validatorUrl: null, persistAuthorization: false, queryConfigEnabled: false };
export function createDocsRouter() {
    const router = Router();
    router.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" }); next(); });
    router.get('/openapi.json', (_req, res) => res.json(openapi));
    router.get('/docs', (_req, res) => res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dearly API Reference</title><link rel="stylesheet" href="/api/docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script><script src="/api/docs/init.js"></script></body></html>'));
    router.get('/docs/init.js', (_req, res) => res.type('js').send('window.onload=()=>SwaggerUIBundle(' + JSON.stringify(docsOptions) + ');'));
    const directory = dirname(require.resolve('swagger-ui-dist/package.json'));
    // Explicit asset allowlist: no directory browsing, source maps or remote CDN.
    for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js'])
        router.get('/docs/' + file, (_req, res) => res.sendFile(join(directory, file)));
    return router;
}
