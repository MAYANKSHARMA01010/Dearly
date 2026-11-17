import { loadEnvironment } from '../configs/loadEnvironment';
import { verifySmtp } from '../providers/email/smtp.transport';

async function main() {
  const result = await verifySmtp(loadEnvironment().email);
  console.log(`SMTP connection check: ${result}. No email was submitted.`);
  if (result !== 'READY') process.exitCode = 1;
}

void main().catch(() => {
  // Environment/provider errors are intentionally not printed; they can contain secrets.
  console.error('SMTP connection check failed. Review private backend configuration.');
  process.exitCode = 1;
});
