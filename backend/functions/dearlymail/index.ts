import { Pool } from "pg";
import { createEmailRelayHandler } from "../../src/services/emailRelay.service";
import { PostgresEmailRelay } from "../../src/providers/postgres/emailRelay.repository";
import { createEmailSender } from "../../src/providers/email/email.provider";
import { verifySmtp } from "../../src/providers/email/smtp.transport";
import type { SmtpConfig } from "../../src/configs/env";
function required(name: string) {
  const value = process.env[name];
  if (!value) throw Error("Mail relay configuration required.");
  return value;
}
const connection = new URL(required("DATABASE_URL"));
connection.searchParams.delete("sslmode");
connection.searchParams.delete("channel_binding");
const pool = new Pool({
  connectionString: connection.toString(),
  max: 2,
  ssl: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
  query_timeout: 15000,
});
pool.on("error", () => {});
const smtp: SmtpConfig = {
  host: "smtp.gmail.com",
  port: 465,
  user: required("SMTP_USER"),
  from: required("SMTP_FROM"),
  password: required("SMTP_PASSWORD"),
};
const secret = required("EMAIL_RELAY_SECRET"),
  accessSecret = required("EXTERNAL_ACCESS_SECRET"),
  publicUrl = new URL(required("CONTENT_PUBLIC_URL")).origin;
if (
  !/^[a-f0-9]{64}$/.test(secret) ||
  !/^[a-f0-9]{64}$/.test(accessSecret) ||
  !publicUrl.startsWith("https://")
)
  throw Error("Mail relay configuration invalid.");
export default createEmailRelayHandler({
  secret,
  accessSecret,
  publicUrl,
  repository: new PostgresEmailRelay(pool),
  send: createEmailSender(smtp),
  verify: () => verifySmtp(smtp),
});
