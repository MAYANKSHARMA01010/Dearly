import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    auth?: import('../services/auth.service').AuthIdentity;
  }
}
