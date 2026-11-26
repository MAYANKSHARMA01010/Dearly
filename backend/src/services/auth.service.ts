import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { matchesHash, newOtp, newToken, otpHash, sessionIdFromToken, tokenHash } from '../utils/authCrypto';
import type { OtpProvider, OtpDispatchResult } from '../providers/otp/otp.provider';
import { timeOtpStage } from '../utils/otpTiming';
import type { AppLogger } from '../utils/logger';
import type { ProfileInput } from '../validators/auth.validators';

const MINUTE = 60_000;
const OTP_TTL = 5 * MINUTE;
const ACCESS_TTL = 15 * MINUTE;
const SESSION_TTL = 30 * 24 * 60 * MINUTE;
const invalidOtp = () => new ApiError(401, 'INVALID_OTP', 'Code is invalid or no longer available.');
const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'A valid session is required.');
const limited = () => new ApiError(429, 'AUTH_RATE_LIMITED', 'Too many attempts. Try again later.');
export const publicUser = (u: User) => ({
  id: u.id, phone: u.phone, phoneVerifiedAt: u.phoneVerifiedAt,
  name: u.name, email: u.email, emailVerifiedAt: u.emailVerifiedAt, timezone: u.timezone, createdAt: u.createdAt,
});
export type AuthIdentity = { sessionId: string; userId: string };

export class AuthService {
  constructor(
    private readonly db: PrismaClient,
    private readonly pepper: string,
    private readonly provider: OtpProvider,
    private readonly now: () => Date = () => new Date(),
    private readonly code: () => string = newOtp,
    private readonly logger?: AppLogger,
  ) {}

  private async locked<T>(key: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      // Transaction-scoped locks work through Neon/PgBouncer transaction pooling.
      // READ COMMITTED sees changes committed by the preceding lock holder.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dearly:auth:${key}`}, 0))`;
      return work(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
  }

  async otpStatus() {
    return { status: this.provider.readiness ? await this.provider.readiness() : 'READY', channel: this.provider.channel ?? 'simulated' };
  }
  async requestOtp(phone: string, previousId?: string, requestId?: string) {
    return timeOtpStage('TOTAL', () => this.requestOtpFlow(phone, previousId, requestId), this.logger, requestId);
  }
  private async requestOtpFlow(phone: string, previousId?: string, requestId?: string) {
    // Cold-start probes are read-only: do not create a challenge, expire an old
    // code, consume a cooldown or reserve a sender budget until ready.
    const readiness = await timeOtpStage('READINESS', () => this.otpStatus(), this.logger, requestId);
    if(readiness.status !== 'READY') throw new ApiError(503, readiness.status === 'WARMING' ? 'OTP_GATEWAY_WARMING' : 'OTP_GATEWAY_UNAVAILABLE', 'WhatsApp verification is connecting or unavailable. No code was requested. Try again shortly.');
    const reservation = await timeOtpStage('RESERVATION', () => this.locked(`phone:${phone}`, async (tx) => {
      const now = this.now();
      if (previousId) {
        const prior = await tx.otpChallenge.findUnique({ where: { id: previousId } });
        if (!prior || prior.phone !== phone || prior.consumedAt) throw invalidOtp();
      }
      const state = await tx.phoneAuthState.findUnique({ where: { phone } });
      const inWindow = state && now.getTime() - state.requestWindowAt.getTime() < 60 * MINUTE;
      if (state && (now.getTime() - state.lastRequestedAt.getTime() < MINUTE || (inWindow && state.requestCount >= 5))) throw limited();
      // Separate persistent sender quota prevents many distinct numbers exhausting WAHA.
      // Consume before network I/O, including unknown outcomes; never auto refund/retry.
      if (this.provider.budget) {
        const id = createHash('sha256').update(this.provider.budget.key).digest('hex');
        await tx.senderBudget.upsert({ where: { id }, create: { id, resetsAt: new Date(now.getTime() + 24 * 60 * MINUTE) }, update: { id } });
        let budget = await tx.senderBudget.findUniqueOrThrow({ where: { id } });
        if (budget.resetsAt <= now)
          budget = await tx.senderBudget.update({ where: { id }, data: { count: 0, resetsAt: new Date(now.getTime() + 24 * 60 * MINUTE) } });
        if (budget.count >= this.provider.budget.dailyLimit) throw limited();
        await tx.senderBudget.update({ where: { id }, data: { count: { increment: 1 } } });
      }
      const id = randomUUID();
      const code = this.code();
      await tx.phoneAuthState.upsert({ where: { phone },
        create: { phone, requestWindowAt: now, requestCount: 1, lastRequestedAt: now, failureWindowAt: now },
        update: { requestWindowAt: inWindow ? state.requestWindowAt : now,
          requestCount: inWindow ? state.requestCount + 1 : 1, lastRequestedAt: now },
      });
      // A replacement immediately supersedes all older codes, even if dispatch fails.
      await tx.otpChallenge.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: now } });
      const challenge = await tx.otpChallenge.create({ data: {
        id, phone, codeHash: otpHash(this.pepper, id, code), expiresAt: new Date(now.getTime() + OTP_TTL), createdAt: now,
        ...(this.provider.deletionScope && { deletionScope: this.provider.deletionScope, deleteAfter: new Date(now.getTime() + OTP_TTL) }),
      } });
      return { challenge, code };
    }), this.logger, requestId);
    // No provider I/O inside the database transaction; no automatic retries.
    let outcome: OtpDispatchResult;
    try { outcome = await timeOtpStage('DISPATCH', () => this.provider.dispatch({ phone, code: reservation.code, challengeId: reservation.challenge.id }), this.logger, requestId); }
    catch { outcome = { status: 'unknown', code: 'DISPATCH_UNCERTAIN' }; }
    const active = await timeOtpStage('FINALIZATION', () => this.locked(`phone:${phone}`, async (tx) => {
      // Preserve cleanup identity even if another request superseded this code
      // while the gateway was sending. It never makes that code valid again.
      if (outcome.status === 'accepted')
        await tx.otpChallenge.updateMany({ where: { id: reservation.challenge.id },
          data: { providerMessageId: outcome.providerMessageId } });
      const updated = await tx.otpChallenge.updateMany({ where: {
        id: reservation.challenge.id, consumedAt: null, expiresAt: { gt: this.now() }, dispatchStatus: 'pending',
      }, data: {
        dispatchStatus: outcome.status,
      } });
      return updated.count === 1;
    }), this.logger, requestId);
    if (!active || outcome.status === 'rejected' || outcome.status === 'unknown') {
      throw new ApiError(503, 'OTP_UNAVAILABLE', 'Code submission could not be confirmed. Try again later.');
    }
    return {
      challengeId: reservation.challenge.id, expiresAt: reservation.challenge.expiresAt,
      resendAfterSeconds: 60, dispatch: outcome.status,
      ...(this.provider.channel && { channel: this.provider.channel }),
      ...(outcome.status === 'simulated' && { developmentCode: outcome.developmentCode }),
    };
  }

  async resendOtp(challengeId: string, requestId?: string) {
    const challenge = await this.db.otpChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw invalidOtp();
    return this.requestOtp(challenge.phone, challengeId, requestId);
  }

  async verifyOtp(challengeId: string, code: string) {
    const found = await this.db.otpChallenge.findUnique({ where: { id: challengeId } });
    if (!found) throw invalidOtp();
    // Return failures from the transaction so failed-attempt writes COMMIT.
    const result = await this.locked(`phone:${found.phone}`, async (tx) => {
      const now = this.now();
      const challenge = await tx.otpChallenge.findUniqueOrThrow({ where: { id: challengeId } });
      const state = await tx.phoneAuthState.findUniqueOrThrow({ where: { phone: found.phone } });
      const inWindow = now.getTime() - state.failureWindowAt.getTime() < 15 * MINUTE;
      if (inWindow && state.failureCount >= 10) return { error: limited() };
      if (challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= 5 ||
          !['simulated', 'accepted'].includes(challenge.dispatchStatus)) return { error: invalidOtp() };
      if (!matchesHash(otpHash(this.pepper, challengeId, code), challenge.codeHash)) {
        await tx.otpChallenge.update({ where: { id: challengeId }, data: { attempts: { increment: 1 } } });
        await tx.phoneAuthState.update({ where: { phone: found.phone }, data: {
          failureWindowAt: inWindow ? state.failureWindowAt : now, failureCount: inWindow ? state.failureCount + 1 : 1,
        } });
        return { error: invalidOtp() };
      }
      await tx.otpChallenge.update({ where: { id: challengeId }, data: { consumedAt: now } });
      const user = await tx.user.upsert({ where: { phone: found.phone },
        create: { phone: found.phone, phoneVerifiedAt: now }, update: { phoneVerifiedAt: now } });
      const sessionId = randomUUID();
      const accessToken = newToken(sessionId);
      const refreshToken = newToken(sessionId);
      const expiresAt = new Date(now.getTime() + SESSION_TTL);
      const accessExpiresAt = new Date(now.getTime() + ACCESS_TTL);
      await tx.session.create({ data: { id: sessionId, userId: user.id, accessHash: tokenHash(accessToken),
        accessExpiresAt, expiresAt, refreshTokens: { create: { hash: tokenHash(refreshToken) } } } });
      return { value: { user: publicUser(user), accessToken, refreshToken, accessExpiresAt, sessionExpiresAt: expiresAt, tokenType: 'Bearer' } };
    });
    if (result.error) throw result.error;
    return result.value;
  }

  async authenticate(token: string): Promise<AuthIdentity> {
    const id = sessionIdFromToken(token);
    if (!id) throw unauthorized();
    const session = await this.db.session.findUnique({ where: { id } });
    const now = this.now();
    if (!session || session.revokedAt || session.expiresAt <= now || session.accessExpiresAt <= now ||
        !matchesHash(tokenHash(token), session.accessHash)) throw unauthorized();
    return { sessionId: id, userId: session.userId };
  }

  async refresh(refreshToken: string) {
    const id = sessionIdFromToken(refreshToken);
    if (!id) throw unauthorized();
    const result = await this.locked(`session:${id}`, async (tx) => {
      const now = this.now();
      const session = await tx.session.findUnique({ where: { id } });
      const previous = await tx.refreshToken.findUnique({ where: { hash: tokenHash(refreshToken) } });
      if (!session || !previous || previous.sessionId !== id || session.revokedAt || session.expiresAt <= now) return { error: unauthorized() };
      if (previous.usedAt) {
        await tx.session.update({ where: { id }, data: { revokedAt: now } });
        return { error: unauthorized() };
      }
      const accessToken = newToken(id);
      const nextRefresh = newToken(id);
      const accessExpiresAt = new Date(Math.min(now.getTime() + ACCESS_TTL, session.expiresAt.getTime()));
      await tx.refreshToken.update({ where: { hash: previous.hash }, data: { usedAt: now } });
      await tx.refreshToken.create({ data: { hash: tokenHash(nextRefresh), sessionId: id } });
      await tx.session.update({ where: { id }, data: { accessHash: tokenHash(accessToken), accessExpiresAt } });
      return { value: { accessToken, refreshToken: nextRefresh, accessExpiresAt, sessionExpiresAt: session.expiresAt, tokenType: 'Bearer' } };
    });
    if (result.error) throw result.error;
    return result.value;
  }

  async logout(identity: AuthIdentity) {
    await this.locked(`session:${identity.sessionId}`, async (tx) => {
      await tx.session.updateMany({ where: { id: identity.sessionId, userId: identity.userId, revokedAt: null }, data: { revokedAt: this.now() } });
      await tx.pushDevice.updateMany({ where: { sessionId: identity.sessionId, userId: identity.userId }, data: { disabledAt: this.now() } });
    });
    return { loggedOut: true };
  }

  async getProfile(identity: AuthIdentity) {
    const user = await this.db.user.findUnique({ where: { id: identity.userId } });
    if (!user) throw unauthorized();
    return publicUser(user);
  }

  async updateProfile(identity: AuthIdentity, input: ProfileInput) {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dearly:email:${identity.userId}`},0))`;
      const old = await tx.user.findUniqueOrThrow({where:{id:identity.userId}});
      const email = input.email === undefined ? old.email : input.email?.trim().toLowerCase() ?? null;
      const changed = email !== old.email;
      if(changed) await tx.emailVerification.updateMany({where:{userId:identity.userId,consumedAt:null},data:{consumedAt:this.now()}});
      return publicUser(await tx.user.update({where:{id:identity.userId},data:{...input,email,...(changed?{verifiedEmail:null,emailVerifiedAt:null}:{})}}));
    });
  }
}
