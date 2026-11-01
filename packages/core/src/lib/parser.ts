import type { AstNode, AstObjectKey, BOp } from './ast.ts';
import { GluParseError } from './errors.ts';
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
} from './ast.ts';
import { Cursor } from './cursor.ts';
import { Scanner, type TokenType } from './scanner.ts';
import { unreachable } from './utils.ts';
import { bool, nil, number as numValue, str, type GluValue } from './value.ts';

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

type PrefixParseFn = (parser: Parser, canAssign: boolean) => AstNode;
type InfixParseFn = (parser: Parser, lhs: AstNode, canAssign: boolean) => AstNode;

type ParseRule = {
  prefix: PrefixParseFn | null;
  infix: InfixParseFn | null;
  precedence: Precedence;
};

export class Parser {
  readonly cursor: Cursor;

  constructor(source: string) {
    this.cursor = new Cursor(new Scanner(source));
  }

  parse(): AstNode {
    this.cursor.advance();
    const expr = this.expression();
    if (this.cursor.hadError) {
      throw new GluParseError(this.cursor.errors);
    }
    return expr;
  }

  private expression(): AstNode {
    return this.parsePrecedence('assignment');
  }

  literal(): AstNode {
    const token = this.cursor.getPrevious();
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
    this.cursor.consume('rightParen', "Expect ')' after expression.");
    return node;
  }

  unary(): AstNode {
    const operatorType = this.cursor.getPrevious().kind;
    const operand = this.parsePrecedence('unary');
    const op = operatorType === 'bang' ? 'not' : 'negate';
    return astUnary(op, operand);
  }

  binary(lhs: AstNode): AstNode {
    const operatorType = this.cursor.getPrevious().kind;
    const rule = getRule(operatorType);
    const right = this.parsePrecedence(nextPrecedence(rule.precedence));
    const op = BINARY_OPS[operatorType] ?? unreachable();
    return astBinary(op, lhs, right);
  }

  logical(lhs: AstNode): AstNode {
    const operatorType = this.cursor.getPrevious().kind;
    const rule = getRule(operatorType);
    const right = this.parsePrecedence(nextPrecedence(rule.precedence));
    const op = operatorType === 'and' ? 'and' : 'or';
    return astLogical(op, lhs, right);
  }

  list(): AstNode {
    const items: AstNode[] = [];
    if (!this.cursor.check('rightBracket')) {
      do {
        items.push(this.expression());
      } while (this.cursor.matches('comma'));
    }
    this.cursor.consume('rightBracket', "Expected ']'.");
    return astList(items);
  }

  variable(): AstNode {
    return astVariableRef(this.cursor.getPrevious().lexeme);
  }

  blockOrObjectLiteral(): AstNode {
    return this.lookObjectLiteralAhead() ? this.objectLiteral() : this.block();
  }

  lookObjectLiteralAhead(): boolean {
    const lookAheadParser = this.cursor.clone();
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
    if (!this.cursor.check('rightBrace')) {
      do {
        let key: AstObjectKey;
        if (this.cursor.matches('identifier')) {
          key = astKeyLiteral(this.cursor.getPrevious().lexeme);
        } else if (this.cursor.matches('string')) {
          const lexeme = this.cursor.getPrevious().lexeme;
          key = astKeyLiteral(lexeme.slice(1, -1));
        } else if (this.cursor.matches('leftBracket')) {
          const keyExpr = this.expression();
          this.cursor.consume('rightBracket', "Expected ']'.");
          key = astKeyComputed(keyExpr);
        } else {
          this.cursor.errorAtCurrent('Expected a string or an identifier.');
          key = astKeyLiteral('error');
        }
        this.cursor.consume('colon', "Expected ':'.");
        entries.push({ key, value: this.expression() });
      } while (this.cursor.matches('comma'));
    }
    this.cursor.consume('rightBrace', "Expected '}'.");
    return astObject(entries);
  }

  block(): AstNode {
    const items: AstNode[] = [];
    if (!this.cursor.check('rightBrace')) {
      do {
        items.push(this.expression());
      } while (this.cursor.matches('semicolon'));
    }
    this.cursor.consume('rightBrace', "Expected '}'.");
    return astBlock(items);
  }

  letBinding(): AstNode {
    this.cursor.consume('identifier', 'Expected an identifier.');
    const name = this.cursor.getPrevious().lexeme;
    this.cursor.consume('equal', "Expected '='.");
    return astBinding(name, this.expression());
  }

  indexedAccess(lhs: AstNode): AstNode {
    const indexExpr = this.expression();
    this.cursor.consume('rightBracket', "Expected ']'.");
    return astIndex(lhs, indexExpr);
  }

  dot(lhs: AstNode): AstNode {
    this.cursor.consume('identifier', "Expect property name after '.'.");
    return astProperty(lhs, this.cursor.getPrevious().lexeme);
  }

  ifExpression(): AstNode {
    this.cursor.consume('leftParen', "Expect '(' after 'if'.");
    const condition = this.expression();
    this.cursor.consume('rightParen', "Expect ')' after condition.");
    const thenBranch = this.expression();
    const elseBranch = this.cursor.matches('else') ? this.expression() : null;
    return astIf(condition, thenBranch, elseBranch);
  }

  closure(): AstNode {
    const params: string[] = [];
    if (!this.cursor.check('pipe')) {
      do {
        this.cursor.consume('identifier', 'Expected parameter name.');
        params.push(this.cursor.getPrevious().lexeme);
      } while (this.cursor.matches('comma'));
    }
    this.cursor.consume('pipe', "Expected '|' after parameters.");
    return astClosure(params, this.expression());
  }

  call(lhs: AstNode): AstNode {
    const args: AstNode[] = [];
    if (!this.cursor.check('rightParen')) {
      do {
        args.push(this.expression());
      } while (this.cursor.matches('comma'));
    }
    this.cursor.consume('rightParen', "Expected ')' after arguments.");
    return astCall(lhs, args);
  }

  private parsePrecedence(precedence: Precedence): AstNode {
    this.cursor.advance();
    const prefixRule = getRule(this.cursor.getPrevious().kind).prefix;
    if (prefixRule === null) {
      this.cursor.errorAtCurrent('Expect expression.');
      return astError();
    }
    const canAssign = precedenceRank(precedence) <= precedenceRank('assignment');
    let lhs = prefixRule(this, canAssign);
    while (
      precedenceRank(precedence) <=
      precedenceRank(getRule(this.cursor.getCurrent().kind).precedence)
    ) {
      this.cursor.advance();
      const infixRule = getRule(this.cursor.getPrevious().kind).infix;
      if (infixRule === null) {
        break;
      }
      lhs = infixRule(this, lhs, canAssign);
    }
    if (canAssign && this.cursor.matches('equal')) {
      this.cursor.errorAtCurrent('Invalid assignment target.');
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
      (p) => p.grouping(),
      (p, lhs) => p.call(lhs),
      'call',
    ),
  ],
  ['number', parseRule((p) => p.literal(), null, 'none')],
  ['nil', parseRule((p) => p.literal(), null, 'none')],
  ['true', parseRule((p) => p.literal(), null, 'none')],
  ['false', parseRule((p) => p.literal(), null, 'none')],
  ['identifier', parseRule((p) => p.variable(), null, 'none')],
  ['string', parseRule((p) => p.literal(), null, 'none')],
  ['bangEqual', parseRule(null, (p, lhs) => p.binary(lhs), 'equality')],
  ['equalEqual', parseRule(null, (p, lhs) => p.binary(lhs), 'equality')],
  ['greater', parseRule(null, (p, lhs) => p.binary(lhs), 'comparison')],
  ['greaterEqual', parseRule(null, (p, lhs) => p.binary(lhs), 'comparison')],
  ['less', parseRule(null, (p, lhs) => p.binary(lhs), 'comparison')],
  ['lessEqual', parseRule(null, (p, lhs) => p.binary(lhs), 'comparison')],
  ['bang', parseRule((p) => p.unary(), null, 'none')],
  [
    'minus',
    parseRule(
      (p) => p.unary(),
      (p, lhs) => p.binary(lhs),
      'term',
    ),
  ],
  ['plus', parseRule(null, (p, lhs) => p.binary(lhs), 'term')],
  ['star', parseRule(null, (p, lhs) => p.binary(lhs), 'factor')],
  ['slash', parseRule(null, (p, lhs) => p.binary(lhs), 'factor')],
  ['percent', parseRule(null, (p, lhs) => p.binary(lhs), 'factor')],
  ['and', parseRule(null, (p, lhs) => p.logical(lhs), 'and')],
  ['or', parseRule(null, (p, lhs) => p.logical(lhs), 'or')],
  ['dot', parseRule(null, (p, lhs) => p.dot(lhs), 'call')],
  [
    'leftBracket',
    parseRule(
      (p) => p.list(),
      (p, lhs) => p.indexedAccess(lhs),
      'call',
    ),
  ],
  ['leftBrace', parseRule((p) => p.blockOrObjectLiteral(), null, 'none')],
  ['let', parseRule((p) => p.letBinding(), null, 'none')],
  ['if', parseRule((p) => p.ifExpression(), null, 'none')],
  ['pipe', parseRule((p) => p.closure(), null, 'none')],
]);

function getRule(tokenType: TokenType): ParseRule {
  return RULES.get(tokenType) ?? DEFAULT_RULE;
}

export function parse(source: string): AstNode {
  const parser = new Parser(source);
  return parser.parse();
}
