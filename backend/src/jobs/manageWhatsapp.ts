import { runPairingHelper } from '../providers/whatsapp/pairing';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvironment } from '../configs/loadEnvironment';
import { WahaProvider } from '../providers/whatsapp/waha.provider';
import { createDatabase } from '../configs/database';
import { WahaReceiptService } from '../services/wahaReceipt.service';
async function main() {
  const config = loadEnvironment(),
    waha = config.whatsapp;
  if (!waha) throw Error('Not configured');
  const args = process.argv.slice(2),
    command = args[0] ?? 'status';
  if (args.length > 1) throw Error('Invalid arguments');
  const provider = new WahaProvider(waha);
  if (command === 'pair') {
    await runPairingHelper(waha);
    return;
  }
  if (command === 'status') {
    console.log(
      `WhatsApp sender: ${await provider.readiness()}. No message submitted.`,
    );
    return;
  }
  if (command === 'cleanup') {
    const db = createDatabase(config.databaseUrl);
    try {
      const r = await new WahaReceiptService(db.prisma!, waha).cleanup();
      console.log(`Removed ${r.count} expired callback records.`);
    } finally {
      await db.disconnect();
    }
    return;
  }
  if (command === 'start') {
    console.log(
      `Sender session: ${await provider.start()}. Stored credentials preserved; no message submitted.`,
    );
    return;
  }
  if (command === 'init') {
    const callback =
      waha.callbackUrl ??
      (config.nodeEnv === 'production'
        ? undefined
        : 'http://host.docker.internal:8080/webhooks/waha');
    if (!callback) throw Error('Callback URL required');
    console.log(
      `Sender session: ${await provider.initialize(callback)}. Existing configuration preserved; use whatsapp:start or whatsapp:pair. No message submitted.`,
    );
    return;
  }
  if (command === 'qr') {
    const bytes = await provider.pairingImage();
    const root = resolve(__dirname, '../../.runtime'),
      path = resolve(root, `whatsapp-pairing-${Date.now()}.png`);
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600 });
    await chmod(path, 0o600);
    console.log(`Pairing image saved privately: ${path}`);
    return;
  }
  throw Error('Invalid command');
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      'WhatsApp operation unavailable. Check private configuration, service availability and session status. No message submitted.',
    );
    process.exitCode = 1;
  });
