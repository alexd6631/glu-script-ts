import { GluEvalError } from './errors.js';
import { Evaluator, isTruthy } from './evaluator.js';
import {
  bool,
  list as listValue,
  nil,
  number as numberValue,
  str,
  type Closure,
  type GluValue,
} from './value.js';

type ListAndClosure = {
  list: GluValue[];
  closure: Closure;
};

function requireListAndClosure(args: GluValue[]): ListAndClosure {
  if (args[0].tag !== 'list') {
    throw new GluEvalError('Expected array');
  }
  if (args[1].tag !== 'closure') {
    throw new GluEvalError('Expected closure');
  }
  return { list: args[0].items, closure: args[1].closure };
}

export function registerStdlib(evaluator: Evaluator): void {
  evaluator.registerNative('range', 2, async (_evaluator, args) => {
    if (args[0].tag !== 'number' || args[1].tag !== 'number') {
      throw new GluEvalError('Expected numbers');
    }

    const a = args[0].value;
    const b = args[1].value;

    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      throw new GluEvalError('Expected integers');
    }

    const start = a;
    const end = b;

    const items: GluValue[] = [];
    for (let i = start; i < end; i++) {
      items.push(numberValue(i));
    }
    return listValue(items);
  });

  evaluator.registerNative('len', 1, async (_evaluator, args) => {
    if (args[0].tag === 'list') {
      return numberValue(args[0].items.length);
    } else if (args[0].tag === 'string') {
      return numberValue(args[0].value.length);
    } else {
      throw new GluEvalError('Expected array or string');
    }
  });

  evaluator.registerNative('keys', 1, async (_evaluator, args) => {
    if (args[0].tag !== 'object') {
      throw new GluEvalError('Expected object');
    }
    const keys = [...args[0].fields.keys()];
    const keyValues = keys.map((key) => str(key));
    return listValue(keyValues);
  });

  evaluator.registerNative('values', 1, async (_evaluator, args) => {
    if (args[0].tag !== 'object') {
      throw new GluEvalError('Expected object');
    }
    const values = [...args[0].fields.values()];
    return listValue(values);
  });

  evaluator.registerNative('map', 2, async (evaluator, args) => {
    const { list, closure } = requireListAndClosure(args);
    const items: GluValue[] = [];
    for (const item of list) {
      items.push(await evaluator.callClosure(closure, [item]));
    }
    return listValue(items);
  });

  evaluator.registerNative('filter', 2, async (evaluator, args) => {
    const { list, closure } = requireListAndClosure(args);
    const items: GluValue[] = [];
    for (const item of list) {
      if (isTruthy(await evaluator.callClosure(closure, [item]))) {
        items.push(item);
      }
    }
    return listValue(items);
  });

  evaluator.registerNative('fold', 3, async (evaluator, args) => {
    if (args[0].tag !== 'list') {
      throw new GluEvalError('Expected array');
    }
    if (args[2].tag !== 'closure') {
      throw new GluEvalError('Expected closure');
    }
    let acc = args[1];
    for (const item of args[0].items) {
      acc = await evaluator.callClosure(args[2].closure, [acc, item]);
    }
    return acc;
  });

  evaluator.registerNative('reduce', 2, async (evaluator, args) => {
    const { list, closure } = requireListAndClosure(args);
    const iter = list[Symbol.iterator]();
    const first = iter.next();
    if (first.done) {
      throw new GluEvalError('Cannot reduce an empty array.');
    }
    let acc = first.value;
    for (const item of iter) {
      acc = await evaluator.callClosure(closure, [acc, item]);
    }
    return acc;
  });

  evaluator.registerNative('any', 2, async (evaluator, args) => {
    const { list, closure } = requireListAndClosure(args);
    for (const item of list) {
      if (isTruthy(await evaluator.callClosure(closure, [item]))) {
        return bool(true);
      }
    }
    return bool(false);
  });

  evaluator.registerNative('every', 2, async (evaluator, args) => {
    const { list, closure } = requireListAndClosure(args);
    for (const item of list) {
      if (!isTruthy(await evaluator.callClosure(closure, [item]))) {
        return bool(false);
      }
    }
    return bool(true);
  });

  evaluator.registerNative('find', 2, async (evaluator, args) => {
    const { list, closure } = requireListAndClosure(args);
    for (const item of list) {
      if (isTruthy(await evaluator.callClosure(closure, [item]))) {
        return item;
      }
    }
    return nil;
  });
}
