import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { WahaConfig } from '../../configs/env';
import { WahaProvider } from './waha.provider';
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pair Dearly WhatsApp</title><style>body{font:18px/1.6 system-ui;background:#fffbfe;color:#1c1b1f;max-width:600px;margin:40px auto;padding:24px}h1{line-height:1.2}img{display:block;width:min(100%,320px);margin:24px 0}button{font:inherit;background:#6750a4;color:white;padding:12px 24px;min-height:48px;border:0;border-radius:12px;cursor:pointer}button:focus-visible{outline:3px solid #6750a4;outline-offset:4px}</style><main><h1>Pair Dearly WhatsApp</h1><p>On your sender phone, open WhatsApp → Settings → Linked devices → Link a device.</p><p>Scan this code. It refreshes automatically. This local setup page never sends a message.</p><img id="qr" alt="WhatsApp pairing code"><p id="status" role="status" aria-live="polite">Checking sender…</p><button id="refresh">Refresh code</button></main><script src="/pair.js" defer></script></html>`;
const script = `const image=document.getElementById('qr'),status=document.getElementById('status');let ready=false,busy=false;async function refresh(){if(ready||busy)return;busy=true;try{const r=await fetch('/status',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();ready=d.status==='READY';status.textContent=ready?'Sender ready. You can close this page.':d.status==='UNPAIRED'?'Waiting for your phone to finish linking.':d.status==='OFFLINE'||d.status==='STOPPED'?'Sender is disconnected. Run whatsapp:start, then refresh.':'Waiting for the sender service.';if(ready){image.removeAttribute('src');image.hidden=true;}else if(d.status==='UNPAIRED'){image.hidden=false;image.src='/qr?t='+Date.now();}else{image.hidden=true;image.removeAttribute('src');}}catch{status.textContent='Setup helper is unavailable. Run whatsapp:pair again.';}finally{busy=false;}}document.getElementById('refresh').onclick=refresh;refresh();setInterval(refresh,10000);`;
export function pairingHandler(
  config: WahaConfig,
  request: typeof fetch = fetch,
) {
  const provider = new WahaProvider(config, request);
  return (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    const host = req.headers.host?.split(':')[0],
      site = req.headers['sec-fetch-site'];
    if (
      !['localhost', '127.0.0.1'].includes(host ?? '') ||
      (site && !['same-origin', 'none'].includes(String(site)))
    ) {
      res.writeHead(403);
      res.end('Local setup access only.');
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end();
      return;
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(page);
      return;
    }
    if (path === '/pair.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(script);
      return;
    }
    void (async () => {
      if (path === '/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: await provider.readiness() }));
        return;
      }
      if (path === '/qr') {
        const image = await provider.pairingImage();
        res.setHeader('Content-Type', 'image/png');
        res.end(image);
        return;
      }
      res.writeHead(404);
      res.end();
    })().catch(() => {
      if (!res.headersSent) res.writeHead(503);
      res.end('Pairing image unavailable. Check sender status.');
    });
  };
}
export async function runPairingHelper(config: WahaConfig) {
  const server = createServer(pairingHandler(config));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(3101, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  console.log(
    'Open http://localhost:3101 to pair Dearly. Local-only helper; no messages are submitted.',
  );
  const stop = () => {
    server.close();
    server.closeAllConnections();
  };
  const expiry = setTimeout(stop, 15 * 60000);
  expiry.unref();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  await new Promise<void>((resolve) => server.once('close', resolve));
  clearTimeout(expiry);
  process.off('SIGTERM', stop);
  process.off('SIGINT', stop);
}
