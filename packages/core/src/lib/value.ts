import type { ClosureNode } from './ast.js';
import type { Environment } from './environment.js';
import type { Evaluator } from './evaluator.js';

export type GluValue =
  | { tag: 'nil' }
  | { tag: 'bool'; value: boolean }
  | { tag: 'number'; value: number }
  | { tag: 'string'; value: string }
  | { tag: 'list'; items: GluValue[] }
  | { tag: 'object'; fields: Map<string, GluValue> }
  | { tag: 'closure'; closure: Closure }
  | { tag: 'native'; fn: NativeFn; arity: number }
  | { tag: 'unknown'; value: unknown };

export interface Closure {
  node: ClosureNode;
  env: Environment;
}

export type MaybeAsync<T> = T | Promise<T>;

export type NativeFn = (evaluator: Evaluator, args: GluValue[]) => MaybeAsync<GluValue>;

export const nil: GluValue = { tag: 'nil' };
export const bool = (value: boolean): GluValue => ({ tag: 'bool', value });
export const number = (value: number): GluValue => ({ tag: 'number', value });
export const str = (value: string): GluValue => ({ tag: 'string', value });
export const list = (items: GluValue[]): GluValue => ({ tag: 'list', items });
export const object = (fields: Map<string, GluValue>): GluValue => ({ tag: 'object', fields });
export const closure = (node: ClosureNode, env: Environment): GluValue => ({
  tag: 'closure',
  closure: { node, env },
});

export const unknown = (value: unknown): GluValue => ({ tag: 'unknown', value });

export function valuesEqual(a: GluValue, _b: GluValue): boolean {
  if (a.tag !== _b.tag) {
    return false;
  }
  switch (a.tag) {
    case 'nil':
      return true;
    case 'bool':
    case 'number':
    case 'string':
      return a.value === (_b as typeof a).value;
    case 'list': {
      const b = _b as typeof a;
      return (
        a.items.length === b.items.length &&
        a.items.every((item, i) => valuesEqual(item, b.items[i]))
      );
    }
    case 'object': {
      const b = _b as typeof a;
      if (a.fields.size !== b.fields.size) {
        return false;
      }
      for (const [key, value] of a.fields) {
        if (!b.fields.has(key) || !valuesEqual(value, b.fields.get(key)!)) {
          return false;
        }
      }
      return true;
    }
    case 'closure': {
      const b = _b as typeof a;
      return a.closure.node === b.closure.node && a.closure.env === b.closure.env;
    }
    case 'native': {
      const b = _b as typeof a;
      return a.fn === b.fn && a.arity === b.arity;
    }
    case 'unknown': {
      const b = _b as typeof a;
      return a.value === b.value;
    }
  }
}
