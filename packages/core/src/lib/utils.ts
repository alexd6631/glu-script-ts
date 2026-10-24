import { GluPanicError } from './errors.js';

export function unreachable(): never {
  throw new GluPanicError('unreachable');
}
