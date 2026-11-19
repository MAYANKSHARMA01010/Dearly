import { loadEnvironment } from '../configs/loadEnvironment';
import { EmailRelay } from '../providers/email/relay.provider';
import { verifySmtp } from '../providers/email/smtp.transport';

async function main() {
  const config = loadEnvironment().email;
  const result = config?.mode === 'relay'
    ? await new EmailRelay(config).verify()
    : await verifySmtp(config);
  console.log(`Gmail connection check: ${result}. No email was submitted.`);
  if (result !== 'READY') process.exitCode = 1;
}

void main().catch(() => {
  // Environment/provider errors are intentionally not printed; they can contain secrets.
  console.error('Gmail connection check failed. Review private backend configuration.');
  process.exitCode = 1;
});
