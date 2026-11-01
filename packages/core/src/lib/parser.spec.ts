import {
  astBinary,
  astBinding,
  astBlock,
  astCall,
  astClosure,
  astIf,
  astIndex,
  astKeyComputed,
  astKeyLiteral,
  astList,
  astLiteral,
  astLogical,
  astObject,
  astObjectEntry,
  astProperty,
  astUnary,
  astVariableRef,
} from './ast.ts';
import { parse } from './parser.ts';
import { GluParseError } from './errors.ts';
import { bool, nil, number, str } from './value.ts';

const n = (value: number) => astLiteral(number(value));
const s = (value: string) => astLiteral(str(value));
const b = (value: boolean) => astLiteral(bool(value));

const key = astKeyLiteral;
const computed = astKeyComputed;

describe('precedence and associativity', () => {
  it('parses expression precedence', () => {
    expect(parse('1 + 1 - 2 * 3 + 2/5')).toEqual(
      astBinary(
        'add',
        astBinary('sub', astBinary('add', n(1), n(1)), astBinary('mul', n(2), n(3))),
        astBinary('div', n(2), n(5)),
      ),
    );
  });

  it('binds comparison looser than term', () => {
    expect(parse('1 < 2 + 3')).toEqual(astBinary('less', n(1), astBinary('add', n(2), n(3))));
  });

  it('parses comparisons left-associative', () => {
    expect(parse('1 <= 2 > 3 >= 4')).toEqual(
      astBinary(
        'greaterEqual',
        astBinary('greater', astBinary('lessEqual', n(1), n(2)), n(3)),
        n(4),
      ),
    );
  });

  it('binds equality looser than comparison', () => {
    expect(parse('1 == 2 != 3 < 4')).toEqual(
      astBinary('notEqual', astBinary('equal', n(1), n(2)), astBinary('less', n(3), n(4))),
    );
  });

  it('parses unary negation', () => {
    expect(parse('-1')).toEqual(astUnary('negate', n(1)));
  });

  it('parses parenthesized grouping', () => {
    expect(parse('3 * (1 + 2)')).toEqual(astBinary('mul', n(3), astBinary('add', n(1), n(2))));
  });

  it('binds modulo tighter than addition', () => {
    expect(parse('1 + 2 % 3')).toEqual(astBinary('add', n(1), astBinary('mod', n(2), n(3))));
  });

  it('binds and tighter than or', () => {
    expect(parse('1 or 2 and 3')).toEqual(astLogical('or', n(1), astLogical('and', n(2), n(3))));
  });

  it('parses and/or left-associative', () => {
    expect(parse('1 and 2 or 3')).toEqual(astLogical('or', astLogical('and', n(1), n(2)), n(3)));
  });
});

describe('literals', () => {
  it('parses strings', () => {
    expect(parse('"Hello" + " world"')).toEqual(astBinary('add', s('Hello'), s(' world')));
  });

  it('parses true', () => {
    expect(parse('true')).toEqual(b(true));
  });

  it('parses false', () => {
    expect(parse('false')).toEqual(b(false));
  });

  it('parses nil', () => {
    expect(parse('nil')).toEqual(astLiteral(nil));
  });

  it('parses numbers', () => {
    expect(parse('42.5')).toEqual(n(42.5));
  });

  it('parses lists', () => {
    expect(parse('[42.5, "hello", false, true]')).toEqual(
      astList([n(42.5), s('hello'), b(false), b(true)]),
    );
  });
});

describe('blocks and bindings', () => {
  it('parses blocks of expressions', () => {
    expect(parse('{ 1 + 2; 2 + 2 }')).toEqual(
      astBlock([astBinary('add', n(1), n(2)), astBinary('add', n(2), n(2))]),
    );
  });

  it('parses let bindings', () => {
    expect(parse('{\n  let a = 1;\n  let b = 2;\n  a + b\n  }')).toEqual(
      astBlock([
        astBinding('a', n(1)),
        astBinding('b', n(2)),
        astBinary('add', astVariableRef('a'), astVariableRef('b')),
      ]),
    );
  });

  it('parses index access in bindings', () => {
    expect(
      parse(
        '{\n  let l = [1, 2, 3];\n  let first = l[0];\n  let last = l[2];\n  last + first\n  }',
      ),
    ).toEqual(
      astBlock([
        astBinding('l', astList([n(1), n(2), n(3)])),
        astBinding('first', astIndex(astVariableRef('l'), n(0))),
        astBinding('last', astIndex(astVariableRef('l'), n(2))),
        astBinary('add', astVariableRef('last'), astVariableRef('first')),
      ]),
    );
  });
});

describe('object literals', () => {
  it('parses literal and computed keys', () => {
    expect(parse('{ "aaaa": 1, b: true, c: [1, 2, 3], ["Hello" + "world"]: "test" }')).toEqual(
      astObject([
        astObjectEntry(key('aaaa'), n(1)),
        astObjectEntry(key('b'), b(true)),
        astObjectEntry(key('c'), astList([n(1), n(2), n(3)])),
        astObjectEntry(computed(astBinary('add', s('Hello'), s('world'))), s('test')),
      ]),
    );
  });

  it('parses a lone computed key', () => {
    expect(parse('{ ["hello" + " world"]: 42 }')).toEqual(
      astObject([astObjectEntry(computed(astBinary('add', s('hello'), s(' world'))), n(42))]),
    );
  });
});

describe('property and index access', () => {
  it('parses dot access', () => {
    expect(parse('{a: 1}.a')).toEqual(
      astProperty(astObject([astObjectEntry(key('a'), n(1))]), 'a'),
    );
  });

  it('parses chained dot access', () => {
    expect(parse('{ a: { b: "x" } }.a.b')).toEqual(
      astProperty(
        astProperty(
          astObject([astObjectEntry(key('a'), astObject([astObjectEntry(key('b'), s('x'))]))]),
          'a',
        ),
        'b',
      ),
    );
  });

  it('mixes dot access and indexing', () => {
    expect(parse('{ a: [1, 2] }.a[1]')).toEqual(
      astIndex(
        astProperty(astObject([astObjectEntry(key('a'), astList([n(1), n(2)]))]), 'a'),
        n(1),
      ),
    );
  });
});

describe('if expressions', () => {
  it('parses if without else', () => {
    expect(parse('if (true) 1')).toEqual(astIf(b(true), n(1), null));
  });

  it('parses if/else', () => {
    expect(parse('if (a) 1 else 2')).toEqual(astIf(astVariableRef('a'), n(1), n(2)));
  });

  it('parses else-if chains', () => {
    expect(parse('if (a) 1 else if (b) 2 else 3')).toEqual(
      astIf(astVariableRef('a'), n(1), astIf(astVariableRef('b'), n(2), n(3))),
    );
  });

  it('parses if as a sub-expression', () => {
    expect(parse('let x = if (a) 1 else 2')).toEqual(
      astBinding('x', astIf(astVariableRef('a'), n(1), n(2))),
    );
  });

  it('parses block branches', () => {
    expect(parse('if (a) { 1; 2 } else { 3 }')).toEqual(
      astIf(astVariableRef('a'), astBlock([n(1), n(2)]), astBlock([n(3)])),
    );
  });
});

describe('closures', () => {
  it('parses closures without params', () => {
    expect(parse('|| 42')).toEqual(astClosure([], n(42)));
  });

  it('parses closures with a single param', () => {
    expect(parse('|x| x + 1')).toEqual(
      astClosure(['x'], astBinary('add', astVariableRef('x'), n(1))),
    );
  });

  it('parses closures with multiple params', () => {
    expect(parse('|a, b, c| a + b + c')).toEqual(
      astClosure(
        ['a', 'b', 'c'],
        astBinary(
          'add',
          astBinary('add', astVariableRef('a'), astVariableRef('b')),
          astVariableRef('c'),
        ),
      ),
    );
  });

  it('parses closures with block bodies', () => {
    expect(parse('|x| { let y = x; y * 2 }')).toEqual(
      astClosure(
        ['x'],
        astBlock([
          astBinding('y', astVariableRef('x')),
          astBinary('mul', astVariableRef('y'), n(2)),
        ]),
      ),
    );
  });

  it('parses closures in bindings', () => {
    expect(parse('let f = |a, b| a * b')).toEqual(
      astBinding(
        'f',
        astClosure(['a', 'b'], astBinary('mul', astVariableRef('a'), astVariableRef('b'))),
      ),
    );
  });

  it('parses closures as sub-expressions', () => {
    expect(parse('1 + |x| x')).toEqual(
      astBinary('add', n(1), astClosure(['x'], astVariableRef('x'))),
    );
  });
});

describe('calls', () => {
  it('parses calls without arguments', () => {
    expect(parse('f()')).toEqual(astCall(astVariableRef('f'), []));
  });

  it('parses calls with arguments', () => {
    expect(parse('f(1, 2)')).toEqual(astCall(astVariableRef('f'), [n(1), n(2)]));
  });

  it('parses calls with a single argument', () => {
    expect(parse('f(42)')).toEqual(astCall(astVariableRef('f'), [n(42)]));
  });

  it('parses chained calls', () => {
    expect(parse('f(1)(2)')).toEqual(astCall(astCall(astVariableRef('f'), [n(1)]), [n(2)]));
  });

  it('parses method calls after dot access', () => {
    expect(parse('obj.method(1)')).toEqual(
      astCall(astProperty(astVariableRef('obj'), 'method'), [n(1)]),
    );
  });

  it('parses calls in bindings', () => {
    expect(parse('let result = f(1, 2)')).toEqual(
      astBinding('result', astCall(astVariableRef('f'), [n(1), n(2)])),
    );
  });

  it('still parses grouping when leftParen is both prefix and infix', () => {
    expect(parse('(1 + 2) * 3')).toEqual(astBinary('mul', astBinary('add', n(1), n(2)), n(3)));
  });

  it('parses expression arguments', () => {
    expect(parse('f(1 + 2, "hello")')).toEqual(
      astCall(astVariableRef('f'), [astBinary('add', n(1), n(2)), s('hello')]),
    );
  });

  it('parses immediately-invoked closures', () => {
    expect(parse('(|x| x)(42)')).toEqual(astCall(astClosure(['x'], astVariableRef('x')), [n(42)]));
  });
});

describe('parse errors', () => {
  it.each([
    ['(1 + )', 'Expect expression'],
    ['', 'Expect expression'],
    ['let x < 3', `Expected '='`],
    ['[1, 2', `Expected ']'`],
    ['{ a: 1', `Expected '}'`],
    ['a.', "Expect property name after '.'"],
    ['|x', `Expected '|' after parameters`],
    ['"', 'Unterminated string'],
  ])("throws an error when parsing invalid syntax ('%s')", (input, expected) => {
    expect(() => parse(input)).toThrow(expected);
  });

  // Reproduces the lookObjectLiteralAhead infinite loop: the loop condition
  // checks this.parser.check('eof') but only advances the lookahead clone, which
  // re-scans the final eof token forever.
  it('terminates when an object literal is never closed', () => {
    expect(() => parse('{[')).toThrow(GluParseError);
  });
});
