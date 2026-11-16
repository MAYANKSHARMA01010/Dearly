import type { RequestHandler } from 'express';
import type { AuthIdentity, AuthService } from '../services/auth.service';
import { requireSession } from '../middlewares/requireSession';
import { sendSuccess } from '../utils/response';

export function authController(service: AuthService) {
  const action = (fn: (body: Record<string, string>, identity: AuthIdentity) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
      void fn(req.body, req.auth!).then((data) => sendSuccess(res, data, req.requestId)).catch(next);
    };
  return {
    requireSession: requireSession(service),
    request: action((body) => service.requestOtp(body.phone)),
    resend: action((body) => service.resendOtp(body.challengeId)),
    verify: action((body) => service.verifyOtp(body.challengeId, body.code)),
    refresh: action((body) => service.refresh(body.refreshToken)),
    logout: action((_body, identity) => service.logout(identity)),
    profile: action((_body, identity) => service.getProfile(identity)),
    updateProfile: action((body, identity) => service.updateProfile(identity, body)),
  };
}
