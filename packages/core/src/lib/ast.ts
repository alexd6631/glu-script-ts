import type { GluValue } from './value.js';

export type UOp = 'not' | 'negate';
export type BOp =
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'mod'
  | 'less'
  | 'lessEqual'
  | 'greater'
  | 'greaterEqual'
  | 'equal'
  | 'notEqual';
export type LOp = 'and' | 'or';

export type IfNode = {
  condition: AstNode;
  thenBranch: AstNode;
  elseBranch: AstNode | null;
};

export type ClosureNode = {
  params: string[];
  body: AstNode;
};

export type AstObjectKey = { tag: 'literal'; key: string } | { tag: 'computed'; expr: AstNode };

export type AstObjectEntry = { key: AstObjectKey; value: AstNode };

export function astKeyLiteral(key: string): AstObjectKey {
  return { tag: 'literal', key };
}

export function astKeyComputed(expr: AstNode): AstObjectKey {
  return { tag: 'computed', expr };
}

export function astObjectEntry(key: AstObjectKey, value: AstNode): AstObjectEntry {
  return { key, value };
}

export type AstNode =
  | { tag: 'literal'; value: GluValue }
  | { tag: 'list'; items: AstNode[] }
  | { tag: 'object'; entries: { key: AstObjectKey; value: AstNode }[] }
  | { tag: 'block'; items: AstNode[] }
  | { tag: 'unary'; op: UOp; operand: AstNode }
  | { tag: 'binary'; op: BOp; left: AstNode; right: AstNode }
  | { tag: 'logical'; op: LOp; left: AstNode; right: AstNode }
  | { tag: 'index'; target: AstNode; index: AstNode }
  | { tag: 'property'; target: AstNode; name: string }
  | { tag: 'binding'; name: string; expr: AstNode }
  | { tag: 'variableRef'; name: string }
  | { tag: 'if'; node: IfNode }
  | { tag: 'closure'; node: ClosureNode }
  | { tag: 'call'; callee: AstNode; args: AstNode[] }
  | { tag: 'error' };

export function astLiteral(value: GluValue): AstNode {
  return { tag: 'literal', value };
}

export function astList(items: AstNode[]): AstNode {
  return { tag: 'list', items };
}

export function astObject(entries: AstObjectEntry[]): AstNode {
  return { tag: 'object', entries };
}

export function astBlock(items: AstNode[]): AstNode {
  return { tag: 'block', items };
}

export function astUnary(op: UOp, operand: AstNode): AstNode {
  return { tag: 'unary', op, operand };
}

export function astBinary(op: BOp, left: AstNode, right: AstNode): AstNode {
  return { tag: 'binary', op, left, right };
}

export function astLogical(op: LOp, left: AstNode, right: AstNode): AstNode {
  return { tag: 'logical', op, left, right };
}

export function astIndex(target: AstNode, index: AstNode): AstNode {
  return { tag: 'index', target, index };
}

export function astProperty(target: AstNode, name: string): AstNode {
  return { tag: 'property', target, name };
}

export function astBinding(name: string, expr: AstNode): AstNode {
  return { tag: 'binding', name, expr };
}

export function astVariableRef(name: string): AstNode {
  return { tag: 'variableRef', name };
}

export function astIf(
  condition: AstNode,
  thenBranch: AstNode,
  elseBranch: AstNode | null = null,
): AstNode {
  return { tag: 'if', node: { condition, thenBranch, elseBranch } };
}

export function astClosure(params: string[], body: AstNode): AstNode {
  return { tag: 'closure', node: { params, body } };
}

export function astCall(callee: AstNode, args: AstNode[]): AstNode {
  return { tag: 'call', callee, args };
}

export function astError(): AstNode {
  return { tag: 'error' };
}
