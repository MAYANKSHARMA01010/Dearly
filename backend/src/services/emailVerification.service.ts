import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/ApiError";
import { databaseTime } from "../utils/databaseTime";
import { emailVerificationCode } from "../utils/emailVerificationCode";
import { matchesHash, otpHash } from "../utils/authCrypto";
import type { EmailSender } from "../providers/email/email.provider";

export class EmailVerificationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly secret: string,
    private readonly send: EmailSender,
  ) {}
  private locked<T>(
    userId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dearly:email:${userId}`},0))`;
        return fn(tx);
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }
  async request(userId: string) {
    const reservation = await this.locked(userId, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const email = user.email?.trim().toLowerCase();
      if (!email)
        throw new ApiError(
          400,
          "EMAIL_REQUIRED",
          "Save your email address in Profile first.",
        );
      if (user.verifiedEmail === email && user.emailVerifiedAt)
        throw new ApiError(
          409,
          "EMAIL_VERIFIED",
          "This email is already verified.",
        );
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dearly:email-address:${email}`},0))`;
      const now = await databaseTime(tx),
        since = new Date(now.getTime() - 3600000);
      const recent = await tx.emailVerification.findMany({
        where: { OR: [{ userId }, { email }], createdAt: { gt: since } },
        orderBy: { createdAt: "desc" },
      });
      if (
        recent.length >= 5 ||
        (recent[0] && now.getTime() - recent[0].createdAt.getTime() < 60000)
      )
        throw new ApiError(
          429,
          "EMAIL_RATE_LIMITED",
          "Wait before requesting another email code.",
        );
      const budgetId = "dearly:email-verification:daily";
      await tx.senderBudget.upsert({
        where: { id: budgetId },
        create: { id: budgetId, resetsAt: new Date(now.getTime() + 86400000) },
        update: { id: budgetId },
      });
      const budget = await tx.senderBudget.findUniqueOrThrow({
        where: { id: budgetId },
      });
      if (budget.resetsAt > now && budget.count >= 100)
        throw new ApiError(
          429,
          "EMAIL_RATE_LIMITED",
          "Email verification is temporarily unavailable. Try later.",
        );
      await tx.senderBudget.update({
        where: { id: budgetId },
        data:
          budget.resetsAt <= now
            ? { count: 1, resetsAt: new Date(now.getTime() + 86400000) }
            : { count: { increment: 1 } },
      });
      await tx.emailVerification.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
      const id = randomUUID(),
        code = emailVerificationCode(id, this.secret),
        expiresAt = new Date(now.getTime() + 300000);
      await tx.emailVerification.create({
        data: {
          id,
          userId,
          email,
          expiresAt,
          codeHash: otpHash(this.secret, id, code),
        },
      });
      return { id, email, code, expiresAt };
    });
    let state = "UNKNOWN";
    try {
      state = (
        await this.send(reservation.email, reservation.code, reservation.id)
      ).state;
    } catch {
      /* Never auto-replay uncertain SMTP submissions. */
    }
    await this.db.emailVerification.updateMany({
      where: { id: reservation.id, consumedAt: null },
      data: { dispatchStatus: state },
    });
    if (state !== "ACCEPTED")
      throw new ApiError(
        503,
        "EMAIL_VERIFICATION_UNAVAILABLE",
        "Email code submission could not be confirmed. Wait a minute before trying again.",
      );
    return {
      challengeId: reservation.id,
      expiresAt: reservation.expiresAt,
      resendAfterSeconds: 60,
    };
  }
  async verify(userId: string, id: string, code: string) {
    const result = await this.locked(userId, async (tx) => {
      const now = await databaseTime(tx),
        c = await tx.emailVerification.findFirst({ where: { id, userId } }),
        user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (
        !c ||
        c.consumedAt ||
        c.expiresAt <= now ||
        c.attempts >= 5 ||
        c.dispatchStatus !== "ACCEPTED" ||
        user.email?.trim().toLowerCase() !== c.email
      )
        return false;
      if (!matchesHash(otpHash(this.secret, id, code), c.codeHash)) {
        await tx.emailVerification.update({
          where: { id },
          data: { attempts: { increment: 1 } },
        });
        return false;
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dearly:email-address:${c.email}`},0))`;
      const occupied = await tx.user.findFirst({
        where: { verifiedEmail: c.email, id: { not: userId } },
      });
      if (occupied) return false;
      await tx.user.update({
        where: { id: userId },
        data: { verifiedEmail: c.email, emailVerifiedAt: now },
      });
      await tx.emailVerification.update({
        where: { id },
        data: { consumedAt: now },
      });
      return true;
    });
    if (!result)
      throw new ApiError(
        400,
        "INVALID_EMAIL_CODE",
        "Code is invalid, expired or no longer available. Request a new code if needed.",
      );
    return { verified: true };
  }
}
