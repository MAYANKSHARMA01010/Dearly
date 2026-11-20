import type { Pool } from "pg";
import type {
  EmailRelayRepository,
  RelayClaim,
} from "../../services/emailRelay.service";
import type { EmailResult } from "../email/email.provider";
import { relayResult } from "../email/relay.protocol";
export class PostgresEmailRelay implements EmailRelayRepository {
  constructor(private readonly db: Pool) {}
  async claimVerification(id: string): Promise<RelayClaim> {
    const result = await this.db.query<{email: string}>(`UPDATE email_verifications v SET "dispatchStatus"='SUBMITTING' FROM users u WHERE v.id=$1 AND u.id=v."userId" AND lower(u.email)=v.email AND v."dispatchStatus"='PENDING' AND v."consumedAt" IS NULL AND v."expiresAt">CURRENT_TIMESTAMP RETURNING v.email`, [id]);
    if (result.rows[0]) return { kind: 'claimed', to: result.rows[0].email };
    return { kind: 'inactive' };
  }
  async completeVerification(id: string, result: EmailResult) {
    const written = await this.db.query(`UPDATE email_verifications SET "dispatchStatus"=$2 WHERE id=$1 AND "dispatchStatus"='SUBMITTING'`, [id, result.state]);
    if (written.rowCount !== 1) throw Error('Verification outcome was not persisted.');
  }
  async ready() {
    try {
      return Boolean(
        (
          await this.db.query(
            `SELECT to_regclass('email_relay_submissions') IS NOT NULL AS ready`,
          )
        ).rows[0]?.ready,
      );
    } catch {
      return false;
    }
  }
  async claim(id: string): Promise<RelayClaim> {
    const created = await this.db.query<{ email: string }>(
      `
   WITH claimed AS (
    INSERT INTO email_relay_submissions (id)
    SELECT e.id FROM email_deliveries e JOIN delivery_intents i ON i.id=e."intentId"
    JOIN draft_messages m ON m.id=i."messageId" JOIN draft_recipients r ON r.id=i."recipientId"
    WHERE e.id=$1 AND e.state='SUBMITTING' AND i.channel='EMAIL' AND r.email IS NOT NULL
      AND e."revokedAt" IS NULL AND e."expiresAt">CURRENT_TIMESTAMP
      AND m.status='DISPATCHING' AND m."deliveryEnabled"=true
      AND EXISTS (SELECT 1 FROM delivery_work w WHERE w."messageId"=m.id AND w.state='RUNNING'
       AND w."leaseExpiresAt">CURRENT_TIMESTAMP AND m.version=w."scheduleVersion"+1)
    ON CONFLICT (id) DO NOTHING RETURNING id
   ) SELECT r.email FROM claimed c JOIN email_deliveries e ON e.id=c.id
     JOIN delivery_intents i ON i.id=e."intentId" JOIN draft_recipients r ON r.id=i."recipientId"`,
      [id],
    );
    if (created.rows[0]) return { kind: "claimed", to: created.rows[0].email };
    const existing = await this.db.query<{ result: unknown }>(
      `SELECT result FROM email_relay_submissions WHERE id=$1`,
      [id],
    );
    if (!existing.rows.length) return { kind: "inactive" };
    const parsed = relayResult.safeParse(existing.rows[0].result);
    return { kind: "duplicate", result: parsed.success ? parsed.data : null };
  }
  async complete(id: string, result: EmailResult) {
    const written =
      result.state === "RETRYABLE"
        ? await this.db.query(
            `DELETE FROM email_relay_submissions WHERE id=$1 AND "completedAt" IS NULL`,
            [id],
          )
        : await this.db.query(
            `UPDATE email_relay_submissions SET result=$2::jsonb,"completedAt"=CURRENT_TIMESTAMP WHERE id=$1 AND "completedAt" IS NULL`,
            [id, JSON.stringify(result)],
          );
    if (written.rowCount !== 1)
      throw Error("Email relay result was not persisted.");
  }
}
