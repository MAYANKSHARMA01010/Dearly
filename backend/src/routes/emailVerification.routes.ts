import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../configs/env";
import type { AuthService } from "../services/auth.service";
import { requireSession } from "../middlewares/requireSession";
import { validateBody } from "../middlewares/validateBody";
import { createEmailSender } from "../providers/email/email.provider";
import { EmailVerificationService } from "../services/emailVerification.service";
import { sendSuccess } from "../utils/response";
import { ApiError } from "../utils/ApiError";
export function createEmailVerificationRouter(
  config: AppConfig,
  db?: PrismaClient,
  auth?: AuthService,
) {
  const r = Router();
  r.use(requireSession(auth));
  r.use((_q, s, n) => {
    s.set("Cache-Control", "no-store");
    n();
  });
  r.use(
    rateLimit({
      windowMs: 900000,
      limit: 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  if (!db || !config.email || !config.externalAccess) {
    r.use((_q, _s, n) =>
      n(
        new ApiError(
          503,
          "EMAIL_UNAVAILABLE",
          "Email verification is not configured.",
        ),
      ),
    );
    return r;
  }
  const service = new EmailVerificationService(
    db,
    config.externalAccess.secret,
    createEmailSender(config.email, true),
  );
  r.post("/request", validateBody(z.object({}).strict()), (q, s, n) => {
    void service
      .request(q.auth!.userId)
      .then((d) => sendSuccess(s, d, q.requestId))
      .catch(n);
  });
  r.post(
    "/verify",
    validateBody(
      z
        .object({
          challengeId: z.string().uuid(),
          code: z.string().regex(/^\d{6}$/),
        })
        .strict(),
    ),
    (q, s, n) => {
      void service
        .verify(q.auth!.userId, q.body.challengeId, q.body.code)
        .then((d) => sendSuccess(s, d, q.requestId))
        .catch(n);
    },
  );
  return r;
}
