import { loadEnvironment } from '../configs/loadEnvironment';
import { createDatabase } from '../configs/database';
import { SmsGateProvider } from '../providers/sms/smsgate.provider';

async function main() {
  const config = loadEnvironment(), operation = process.argv[2];
  if (operation === 'cleanup') {
    const db = createDatabase(config.databaseUrl);
    try {
      const result = await db.prisma!.smsReceipt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      console.log(`Expired SMS receipt rows removed: ${result.count}.`);
    } finally { await db.disconnect(); }
    return;
  }
  if (!config.sms) { console.log('SMS sender: DISABLED. No SMS submitted.'); return; }
  const provider = new SmsGateProvider(config.sms);
  if (operation === 'init') {
    const url = process.env.SMSGATE_CALLBACK_URL;
    if (!url || (config.nodeEnv === 'production' && !url.startsWith('https://'))) throw Error('Missing or invalid callback setting');
    await provider.registerCallbacks(url);
    console.log('SMS outbound-only callbacks configured. No SMS submitted.');
  } else if (operation === 'status') {
    console.log(`SMS sender: ${await provider.readiness()}. No SMS submitted.`);
  } else throw Error('Unknown operation');
}
void main().catch(() => { console.error('SMS setup unavailable. Review private settings and phone connection.'); process.exitCode = 1; });
