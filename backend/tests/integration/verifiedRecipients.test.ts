import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { EmailVerificationService } from "../../src/services/emailVerification.service";
import { syncRecipientInbox } from "../../src/services/recipientInbox.service";
import { MailboxService } from "../../src/services/mailbox.service";
import { AuthService } from "../../src/services/auth.service";
import { developmentOtpProvider } from "../../src/providers/otp/otp.provider";
import { emailVerificationCode } from "../../src/utils/emailVerificationCode";
const base = process.env.AUTH_TEST_DATABASE_URL;
if (!base)
  throw Error(
    "Set AUTH_TEST_DATABASE_URL for isolated verified-recipient tests.",
  );
const schema = `dearly_verified_${randomUUID().replaceAll("-", "")}`,
  url = new URL(base);
url.searchParams.set("schema", schema);
const db = new PrismaClient({
    datasources: { db: { url: url.toString() } },
    log: [],
    errorFormat: "minimal",
  }),
  admin = new PrismaClient({
    datasources: { db: { url: base } },
    log: [],
    errorFormat: "minimal",
  }),
  secret = "a".repeat(64);
const user = (phone: string, email?: string) =>
  db.user.create({ data: { phone, email, phoneVerifiedAt: new Date() } });
const service = () =>
  new EmailVerificationService(db, secret, async () => ({
    state: "ACCEPTED",
    code: null,
    providerMessageId: null,
  }));
async function delivery(
  phone: string,
  email?: string,
  options: { future?: boolean; revoked?: boolean; target?: string } = {},
) {
  const owner = await user(
    `+1202${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`,
  );
  const m = await db.draftMessage.create({
    data: {
      ownerId: owner.id,
      status: "SUBMITTED",
      deliveryEnabled: true,
      scheduleTimezone: "UTC",
      scheduleLocalDateTime: "2026-11-20T12:00",
      scheduledFor: new Date(Date.now() + (options.future ? 60000 : -60000)),
      recipients: {
        create: {
          type: email ? "EMAIL" : "PHONE",
          phone: email ? null : phone,
          country: email ? null : "US",
          email,
          position: 0,
          destinationKey: email ? `email:${email}` : `phone:${phone}`,
          targetUserId: options.target,
        },
      },
    },
    include: { recipients: true },
  });
  const intent = await db.deliveryIntent.create({
    data: {
      messageId: m.id,
      recipientId: m.recipients[0].id,
      channel: email ? "EMAIL" : "WHATSAPP",
      consentAt: new Date(),
      externalDelivery: {
        create: {
          state: "ACCEPTED",
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: options.revoked ? new Date() : null,
        },
      },
    },
  });
  return { m, intent };
}
test(
  "verified recipient linking and inbox isolation",
  { timeout: 180000 },
  async (t) => {
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      const names =
        "users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|message_events|email_deliveries|email_relay_submissions|email_verifications|email_budgets|waha_receipts|sms_receipts|operations_runs|account_preferences|notifications|push_devices|push_jobs|EmailState|MessageEventKind|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel";
      for (const folder of readdirSync("prisma/migrations")
        .filter((n) => /^\d/.test(n))
        .sort()) {
        const sql = readFileSync(
          `prisma/migrations/${folder}/migration.sql`,
          "utf8",
        ).replace(new RegExp(`"(${names})"`, "g"), `"${schema}"."$1"`);
        for (const statement of sql
          .replace(/^\s*--.*$/gm, "")
          .split(";")
          .filter((s) => s.trim()))
          await db.$executeRawUnsafe(statement);
      }
      t.beforeEach(async () => {
        await db.draftMessage.deleteMany();
        await db.user.deleteMany();
        await db.senderBudget.deleteMany();
      });
      await t.test(
        "phone matches before email verification; verified email matches once and stays unopened",
        async () => {
          const u = await user("+12025550181", "casey@example.com");
          await delivery(u.phone);
          await delivery("", u.email!);
          await syncRecipientInbox(db, u.id);
          assert.equal(
            await db.inboxItem.count({ where: { userId: u.id } }),
            1,
          );
          const c = await service().request(u.id),
            code = emailVerificationCode(c.challengeId, secret);
          assert.notEqual(
            (
              await db.emailVerification.findUniqueOrThrow({
                where: { id: c.challengeId },
              })
            ).codeHash,
            code,
          );
          await service().verify(u.id, c.challengeId, code);
          await syncRecipientInbox(db, u.id);
          await syncRecipientInbox(db, u.id);
          assert.equal(
            await db.inboxItem.count({
              where: { userId: u.id, openedAt: null },
            }),
            2,
          );
          assert.equal(
            (await new MailboxService(db).dashboard(u.id)).counts.received,
            2,
          );
          await assert.rejects(() =>
            service().verify(u.id, c.challengeId, code),
          );
        },
      );
      await t.test(
        "wrong codes consume attempts; another user cannot verify; resend cooldown persists",
        async () => {
          const u = await user("+12025550181", "casey@example.com"),
            other = await user("+12025550182"),
            c = await service().request(u.id);
          await assert.rejects(() => service().request(u.id));
          await assert.rejects(() =>
            service().verify(
              other.id,
              c.challengeId,
              emailVerificationCode(c.challengeId, secret),
            ),
          );
          for (let n = 0; n < 5; n++)
            await assert.rejects(() =>
              service().verify(u.id, c.challengeId, "not-a-code"),
            );
          await assert.rejects(() =>
            service().verify(
              u.id,
              c.challengeId,
              emailVerificationCode(c.challengeId, secret),
            ),
          );
          assert.equal(
            (
              await db.emailVerification.findUniqueOrThrow({
                where: { id: c.challengeId },
              })
            ).attempts,
            5,
          );
        },
      );
      await t.test(
        "profile email change invalidates proof and pending codes",
        async () => {
          const u = await user("+12025550181", "casey@example.com"),
            c = await service().request(u.id),
            auth = new AuthService(db, secret, developmentOtpProvider());
          await auth.updateProfile(
            { userId: u.id, sessionId: randomUUID() },
            { email: "other@example.com" },
          );
          await assert.rejects(() =>
            service().verify(
              u.id,
              c.challengeId,
              emailVerificationCode(c.challengeId, secret),
            ),
          );
          assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: u.id } }))
              .emailVerifiedAt,
            null,
          );
        },
      );
      await t.test(
        "expired and uncertain challenges never verify",
        async () => {
          const u = await user("+12025550181", "casey@example.com"),
            c = await service().request(u.id);
          await db.emailVerification.update({
            where: { id: c.challengeId },
            data: { expiresAt: new Date(0) },
          });
          await assert.rejects(() =>
            service().verify(
              u.id,
              c.challengeId,
              emailVerificationCode(c.challengeId, secret),
            ),
          );
          await db.emailVerification.update({
            where: { id: c.challengeId },
            data: {
              expiresAt: new Date(Date.now() + 60000),
              dispatchStatus: "UNKNOWN",
            },
          });
          await assert.rejects(() =>
            service().verify(
              u.id,
              c.challengeId,
              emailVerificationCode(c.challengeId, secret),
            ),
          );
        },
      );
      await t.test(
        "future, revoked and other-account-bound deliveries stay inaccessible",
        async () => {
          const u = await user("+12025550181"),
            old = await user("+12025550182");
          await delivery(u.phone, undefined, { future: true });
          await delivery(u.phone, undefined, { revoked: true });
          await delivery(u.phone, undefined, { target: old.id });
          await syncRecipientInbox(db, u.id);
          assert.equal(
            await db.inboxItem.count({ where: { userId: u.id } }),
            0,
          );
        },
      );
      await t.test(
        "a verified email cannot be attached to two accounts",
        async () => {
          const u = await user("+12025550181", "casey@example.com"),
            other = await user("+12025550182", "casey@example.com"),
            c = await service().request(u.id);
          await service().verify(
            u.id,
            c.challengeId,
            emailVerificationCode(c.challengeId, secret),
          );
          await db.emailVerification.updateMany({
            data: { createdAt: new Date(Date.now() - 61000) },
          });
          const second = await service().request(other.id);
          await assert.rejects(() =>
            service().verify(
              other.id,
              second.challengeId,
              emailVerificationCode(second.challengeId, secret),
            ),
          );
          assert.equal(
            (await db.user.findUniqueOrThrow({ where: { id: other.id } }))
              .verifiedEmail,
            null,
          );
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.constructor.name.startsWith("Prisma")
      ) {
        // eslint-disable-next-line preserve-caught-error -- Test database errors can contain private configuration.
        throw Error("Database operation failed in verified recipient test.");
      }
      throw error;
    } finally {
      await db.$disconnect();
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await admin.$disconnect();
    }
  },
);
