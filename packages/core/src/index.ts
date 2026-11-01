import { parse } from './lib/parser.ts';
import { Evaluator } from './lib/evaluator.js';
import { GluConversionError } from './lib/errors.js';
import {
  bool,
  list,
  NativeFn,
  nil,
  number,
  object,
  str,
  unknown,
  type GluValue,
} from './lib/value.js';
import { assertUnreachable } from './lib/utils.ts';

export { GluError, GluParseError, GluEvalError, GluConversionError } from './lib/errors.js';

export function compile(source: string, runtime?: Record<string, Function>) {
  const ast = parse(source);

  return async (input?: Record<string, unknown>) => {
    const evaluator = new Evaluator();

    if (runtime) {
      for (const [name, fn] of Object.entries(runtime)) {
        evaluator.registerGlobal(name, wrapJsFunction(fn));
      }
    }

    if (input) {
      for (const [name, value] of Object.entries(input)) {
        evaluator.registerGlobal(name, fromJs(value));
      }
    }

    return toJs(await evaluator.evaluate(ast));
  };
}

function fromJs(value: unknown): GluValue {
  if (value === null || value === undefined) {
    return nil;
  }
  switch (typeof value) {
    case 'boolean':
      return bool(value);
    case 'number':
      return number(value);
    case 'string':
      return str(value);
    case 'object': {
      if (Array.isArray(value)) {
        return list(value.map(fromJs));
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        return unknown(value);
      }

      // if (Object.getOwnPropertySymbols(value).length > 0) {
      //   throw new GluConversionError('Record keys must be strings to be converted to a GluValue.');
      // }

      const fields = new Map<string, GluValue>();
      for (const key of Object.keys(value)) {
        fields.set(key, fromJs((value as Record<string, unknown>)[key]));
      }
      return object(fields);
    }
  }
  throw new GluConversionError(`Cannot convert a value of type '${typeof value}' to a GluValue.`);
}

function toJs(value: GluValue): unknown {
  switch (value.tag) {
    case 'nil':
      return undefined;
    case 'bool':
      return value.value;
    case 'number':
      return value.value;
    case 'string':
      return value.value;
    case 'list':
      return value.items.map(toJs);
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const [key, v] of value.fields) {
        obj[key] = toJs(v);
      }
      return obj;
    }
    case 'closure':
      return '<closure>';
    case 'native':
      return '<native_fn>';
    case 'unknown':
      return value.value;
    default:
      assertUnreachable(value);
  }
}

function wrapJsFunction(f: Function): GluValue {
  const nativeFn: NativeFn = async (_, args) => {
    const gluArgs = args.map(toJs);
    return fromJs(await f(...gluArgs));
  };
  return { tag: 'native', fn: nativeFn, arity: f.length };
}
