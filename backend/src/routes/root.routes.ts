import { Router } from 'express';
import { apiInfo } from '../controllers/root.controller';

export function createRootRouter() {
  const router = Router();
  router.get('/', apiInfo);
  return router;
}
