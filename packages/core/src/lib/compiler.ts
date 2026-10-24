import type { AstNode, AstObjectKey, BOp } from './ast.js';
import { GluParseError } from './errors.js';
import {
  astBinary,
  astBinding,
  astBlock,
  astCall,
  astClosure,
  astError,
  astIf,
  astIndex,
  astKeyComputed,
  astKeyLiteral,
  astList,
  astLiteral,
  astLogical,
  astObject,
  astProperty,
  astUnary,
  astVariableRef,
} from './ast.js';
import { Parser } from './parser.js';
import { Scanner, type TokenType } from './scanner.js';
import { unreachable } from './utils.js';
import { bool, nil, number as numValue, str, type GluValue } from './value.js';

const PRECEDENCE = [
  'none',
  'assignment',
  'or',
  'and',
  'equality',
  'comparison',
  'term',
  'factor',
  'unary',
  'call',
  'primary',
] as const;

type Precedence = (typeof PRECEDENCE)[number];

function nextPrecedence(p: Precedence): Precedence {
  const idx = PRECEDENCE.indexOf(p);
  return PRECEDENCE[idx + 1];
}

function precedenceRank(p: Precedence): number {
  return PRECEDENCE.indexOf(p);
}

type PrefixParseFn = (compiler: Compiler, canAssign: boolean) => AstNode;
type InfixParseFn = (compiler: Compiler, lhs: AstNode, canAssign: boolean) => AstNode;

type ParseRule = {
  prefix: PrefixParseFn | null;
  infix: InfixParseFn | null;
  precedence: Precedence;
};

export class Compiler {
  readonly parser: Parser;

  constructor(source: string) {
    this.parser = new Parser(new Scanner(source));
  }

  compile(): AstNode {
    this.parser.advance();
    const expr = this.expression();
    if (this.parser.hadError) {
      throw new GluParseError(this.parser.errors);
    }
    return expr;
  }

  private expression(): AstNode {
    return this.parsePrecedence('assignment');
  }

  literal(): AstNode {
    const token = this.parser.getPrevious();
    let value: GluValue;
    switch (token.kind) {
      case 'false':
        value = bool(false);
        break;
      case 'true':
        value = bool(true);
        break;
      case 'nil':
        value = nil;
        break;
      case 'string':
        value = str(token.lexeme.slice(1, -1));
        break;
      case 'number':
        value = numValue(Number(token.lexeme));
        break;
      default:
        unreachable();
    }
    return astLiteral(value);
  }

  grouping(): AstNode {
    const node = this.expression();
    this.parser.consume('rightParen', "Expect ')' after expression.");
    return node;
  }

  unary(): AstNode {
    const operatorType = this.parser.getPrevious().kind;
    const operand = this.parsePrecedence('unary');
    const op = operatorType === 'bang' ? 'not' : 'negate';
    return astUnary(op, operand);
  }

  binary(lhs: AstNode): AstNode {
    const operatorType = this.parser.getPrevious().kind;
    const rule = getRule(operatorType);
    const right = this.parsePrecedence(nextPrecedence(rule.precedence));
    const op = BINARY_OPS[operatorType] ?? unreachable();
    return astBinary(op, lhs, right);
  }

  logical(lhs: AstNode): AstNode {
    const operatorType = this.parser.getPrevious().kind;
    const rule = getRule(operatorType);
    const right = this.parsePrecedence(nextPrecedence(rule.precedence));
    const op = operatorType === 'and' ? 'and' : 'or';
    return astLogical(op, lhs, right);
  }

  list(): AstNode {
    const items: AstNode[] = [];
    if (!this.parser.check('rightBracket')) {
      do {
        items.push(this.expression());
      } while (this.parser.matches('comma'));
    }
    this.parser.consume('rightBracket', "Expected ']'.");
    return astList(items);
  }

  variable(): AstNode {
    return astVariableRef(this.parser.getPrevious().lexeme);
  }

  blockOrObjectLiteral(): AstNode {
    return this.lookObjectLiteralAhead() ? this.objectLiteral() : this.block();
  }

  lookObjectLiteralAhead(): boolean {
    const lookAheadParser = this.parser.clone();
    if (lookAheadParser.matches('leftBracket')) {
      let level = 1;
      while (!lookAheadParser.check('eof')) {
        if (lookAheadParser.matches('rightBracket')) {
          level--;
          if (level === 0) {
            return lookAheadParser.matches('colon');
          }
        } else {
          if (lookAheadParser.check('leftBracket')) {
            level++;
          }
          lookAheadParser.advance();
        }
      }
      return false;
    }
    return (
      (lookAheadParser.matches('identifier') || lookAheadParser.matches('string')) &&
      lookAheadParser.matches('colon')
    );
  }

  objectLiteral(): AstNode {
    const entries: Array<{ key: AstObjectKey; value: AstNode }> = [];
    if (!this.parser.check('rightBrace')) {
      do {
        let key: AstObjectKey;
        if (this.parser.matches('identifier')) {
          key = astKeyLiteral(this.parser.getPrevious().lexeme);
        } else if (this.parser.matches('string')) {
          const lexeme = this.parser.getPrevious().lexeme;
          key = astKeyLiteral(lexeme.slice(1, -1));
        } else if (this.parser.matches('leftBracket')) {
          const keyExpr = this.expression();
          this.parser.consume('rightBracket', "Expected ']'.");
          key = astKeyComputed(keyExpr);
        } else {
          this.parser.errorAtCurrent('Expected a string or an identifier.');
          key = astKeyLiteral('error');
        }
        this.parser.consume('colon', "Expected ':'.");
        entries.push({ key, value: this.expression() });
      } while (this.parser.matches('comma'));
    }
    this.parser.consume('rightBrace', "Expected '}'.");
    return astObject(entries);
  }

  block(): AstNode {
    const items: AstNode[] = [];
    if (!this.parser.check('rightBrace')) {
      do {
        items.push(this.expression());
      } while (this.parser.matches('semicolon'));
    }
    this.parser.consume('rightBrace', "Expected '}'.");
    return astBlock(items);
  }

  letBinding(): AstNode {
    this.parser.consume('identifier', 'Expected an identifier.');
    const name = this.parser.getPrevious().lexeme;
    this.parser.consume('equal', "Expected '='.");
    return astBinding(name, this.expression());
  }

  indexedAccess(lhs: AstNode): AstNode {
    const indexExpr = this.expression();
    this.parser.consume('rightBracket', "Expected ']'.");
    return astIndex(lhs, indexExpr);
  }

  dot(lhs: AstNode): AstNode {
    this.parser.consume('identifier', "Expect property name after '.'.");
    return astProperty(lhs, this.parser.getPrevious().lexeme);
  }

  ifExpression(): AstNode {
    this.parser.consume('leftParen', "Expect '(' after 'if'.");
    const condition = this.expression();
    this.parser.consume('rightParen', "Expect ')' after condition.");
    const thenBranch = this.expression();
    const elseBranch = this.parser.matches('else') ? this.expression() : null;
    return astIf(condition, thenBranch, elseBranch);
  }

  closure(): AstNode {
    const params: string[] = [];
    if (!this.parser.check('pipe')) {
      do {
        this.parser.consume('identifier', 'Expected parameter name.');
        params.push(this.parser.getPrevious().lexeme);
      } while (this.parser.matches('comma'));
    }
    this.parser.consume('pipe', "Expected '|' after parameters.");
    return astClosure(params, this.expression());
  }

  call(lhs: AstNode): AstNode {
    const args: AstNode[] = [];
    if (!this.parser.check('rightParen')) {
      do {
        args.push(this.expression());
      } while (this.parser.matches('comma'));
    }
    this.parser.consume('rightParen', "Expected ')' after arguments.");
    return astCall(lhs, args);
  }

  private parsePrecedence(precedence: Precedence): AstNode {
    this.parser.advance();
    const prefixRule = getRule(this.parser.getPrevious().kind).prefix;
    if (prefixRule === null) {
      this.parser.errorAtCurrent('Expect expression.');
      return astError();
    }
    const canAssign = precedenceRank(precedence) <= precedenceRank('assignment');
    let lhs = prefixRule(this, canAssign);
    while (
      precedenceRank(precedence) <=
      precedenceRank(getRule(this.parser.getCurrent().kind).precedence)
    ) {
      this.parser.advance();
      const infixRule = getRule(this.parser.getPrevious().kind).infix;
      if (infixRule === null) {
        break;
      }
      lhs = infixRule(this, lhs, canAssign);
    }
    if (canAssign && this.parser.matches('equal')) {
      this.parser.errorAtCurrent('Invalid assignment target.');
      return astError();
    }
    return lhs;
  }
}

const BINARY_OPS: Partial<Record<TokenType, BOp>> = {
  plus: 'add',
  minus: 'sub',
  star: 'mul',
  slash: 'div',
  percent: 'mod',
  less: 'less',
  lessEqual: 'lessEqual',
  greater: 'greater',
  greaterEqual: 'greaterEqual',
  equalEqual: 'equal',
  bangEqual: 'notEqual',
};

const DEFAULT_RULE: ParseRule = { prefix: null, infix: null, precedence: 'none' };

const parseRule = (
  prefix: PrefixParseFn | null,
  infix: InfixParseFn | null,
  precedence: Precedence,
): ParseRule => ({ prefix, infix, precedence });

const RULES = new Map<TokenType, ParseRule>([
  [
    'leftParen',
    parseRule(
      (c) => c.grouping(),
      (c, lhs) => c.call(lhs),
      'call',
    ),
  ],
  ['number', parseRule((c) => c.literal(), null, 'none')],
  ['nil', parseRule((c) => c.literal(), null, 'none')],
  ['true', parseRule((c) => c.literal(), null, 'none')],
  ['false', parseRule((c) => c.literal(), null, 'none')],
  ['identifier', parseRule((c) => c.variable(), null, 'none')],
  ['string', parseRule((c) => c.literal(), null, 'none')],
  ['bangEqual', parseRule(null, (c, lhs) => c.binary(lhs), 'equality')],
  ['equalEqual', parseRule(null, (c, lhs) => c.binary(lhs), 'equality')],
  ['greater', parseRule(null, (c, lhs) => c.binary(lhs), 'comparison')],
  ['greaterEqual', parseRule(null, (c, lhs) => c.binary(lhs), 'comparison')],
  ['less', parseRule(null, (c, lhs) => c.binary(lhs), 'comparison')],
  ['lessEqual', parseRule(null, (c, lhs) => c.binary(lhs), 'comparison')],
  ['bang', parseRule((c) => c.unary(), null, 'none')],
  [
    'minus',
    parseRule(
      (c) => c.unary(),
      (c, lhs) => c.binary(lhs),
      'term',
    ),
  ],
  ['plus', parseRule(null, (c, lhs) => c.binary(lhs), 'term')],
  ['star', parseRule(null, (c, lhs) => c.binary(lhs), 'factor')],
  ['slash', parseRule(null, (c, lhs) => c.binary(lhs), 'factor')],
  ['percent', parseRule(null, (c, lhs) => c.binary(lhs), 'factor')],
  ['and', parseRule(null, (c, lhs) => c.logical(lhs), 'and')],
  ['or', parseRule(null, (c, lhs) => c.logical(lhs), 'or')],
  ['dot', parseRule(null, (c, lhs) => c.dot(lhs), 'call')],
  [
    'leftBracket',
    parseRule(
      (c) => c.list(),
      (c, lhs) => c.indexedAccess(lhs),
      'call',
    ),
  ],
  ['leftBrace', parseRule((c) => c.blockOrObjectLiteral(), null, 'none')],
  ['let', parseRule((c) => c.letBinding(), null, 'none')],
  ['if', parseRule((c) => c.ifExpression(), null, 'none')],
  ['pipe', parseRule((c) => c.closure(), null, 'none')],
]);

function getRule(tokenType: TokenType): ParseRule {
  return RULES.get(tokenType) ?? DEFAULT_RULE;
}

export function parse(source: string): AstNode {
  const compiler = new Compiler(source);
  return compiler.compile();
}
