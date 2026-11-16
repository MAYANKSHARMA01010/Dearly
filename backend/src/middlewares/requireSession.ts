import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service';
import { ApiError } from '../utils/ApiError';

export function requireSession(service?: AuthService): RequestHandler {
  return (req, _res, next) => {
    if (!service) return next(new ApiError(503, 'AUTH_DISABLED', 'Authentication is not enabled.'));
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) return next(new ApiError(401, 'UNAUTHORIZED', 'A valid session is required.'));
    void service.authenticate(header.slice(7)).then((identity) => { req.auth = identity; next(); }).catch(next);
  };
}
