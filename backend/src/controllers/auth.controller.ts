import type { RequestHandler } from 'express';
import type { AuthIdentity, AuthService } from '../services/auth.service';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/response';

export function authController(service: AuthService) {
  const action = (fn: (body: Record<string, string>, identity: AuthIdentity) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
      void fn(req.body, req.auth!).then((data) => sendSuccess(res, data, req.requestId)).catch(next);
    };
  const requireSession: RequestHandler = (req, _res, next) => {
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) return next(new ApiError(401, 'UNAUTHORIZED', 'A valid session is required.'));
    void service.authenticate(header.slice(7)).then((identity) => { req.auth = identity; next(); }).catch(next);
  };
  return {
    requireSession,
    request: action((body) => service.requestOtp(body.phone)),
    resend: action((body) => service.resendOtp(body.challengeId)),
    verify: action((body) => service.verifyOtp(body.challengeId, body.code)),
    refresh: action((body) => service.refresh(body.refreshToken)),
    logout: action((_body, identity) => service.logout(identity)),
    profile: action((_body, identity) => service.getProfile(identity)),
    updateProfile: action((body, identity) => service.updateProfile(identity, body)),
  };
}
