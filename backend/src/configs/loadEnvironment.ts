import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { parseEnvironment } from './env';

export function loadEnvironment() {
  // Both src/configs and dist/configs resolve to backend/.env, regardless of cwd.
  dotenv.config({ path: resolve(__dirname, '../../.env') });
  return parseEnvironment(process.env);
}
