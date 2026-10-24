import { GluPanicError } from './errors.js';

export function unreachable(): never {
  throw new GluPanicError('unreachable');
}

export function assertUnreachable(_value: never): never {
  unreachable();
}
