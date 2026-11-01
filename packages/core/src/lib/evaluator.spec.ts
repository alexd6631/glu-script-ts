import { parse } from './parser.ts';
import { Evaluator, evaluateValue } from './evaluator.js';
import { bool, list, nil, number as numValue, str } from './value.js';

async function throwsMessage(source: string): Promise<string> {
  try {
    await evaluateValue(source);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`expected '${source}' to throw`);
}

describe('bindings and scoping', () => {
  it('binds a variable and references it', async () => {
    expect(await evaluateValue('{ let x = 1 + 2; x }')).toEqual(numValue(3));
  });

  it('returns the bound value of a binding expression', async () => {
    expect(await evaluateValue('{ let x = 5 }')).toEqual(numValue(5));
  });

  it('shadows variables in nested blocks', async () => {
    expect(await evaluateValue('{ let x = 1; { let x = 2; x } + x }')).toEqual(numValue(3));
  });

  it('throws on undefined variables', async () => {
    expect(await throwsMessage('foo')).toBe("Undefined variable 'foo'.");
  });

  it('pops block scopes when the block ends', async () => {
    expect(await throwsMessage('{ { let x = 1; 2 }; { x } }')).toBe("Undefined variable 'x'.");
  });
});

describe('indexing', () => {
  it('indexes lists', async () => {
    expect(await evaluateValue('[10, 20, 30][1]')).toEqual(numValue(20));
  });

  it('indexes strings', async () => {
    expect(await evaluateValue('"hello"[1]')).toEqual(str('e'));
  });

  it('supports chained indexed access', async () => {
    expect(await evaluateValue('[[1, 2], [3, 4]][1][0]')).toEqual(numValue(3));
  });

  it('throws when the index is out of range', async () => {
    expect(await throwsMessage('[1, 2][5]')).toBe('Index out of range.');
  });

  it('throws on fractional indices', async () => {
    expect(await throwsMessage('[1, 2][0.5]')).toBe('Index must be a non-negative integer.');
  });

  it('throws on non-number indices', async () => {
    expect(await throwsMessage('[1, 2]["a"]')).toBe('Index must be a number.');
  });

  it('throws when the target is not indexable', async () => {
    expect(await throwsMessage('1[0]')).toBe('Only lists and strings can be indexed.');
  });
});

describe('properties', () => {
  it('accesses object properties', async () => {
    expect(await evaluateValue('{a: 1}.a')).toEqual(numValue(1));
  });

  it('supports chained property access', async () => {
    expect(await evaluateValue('{a: {b: "x"}}.a.b')).toEqual(str('x'));
  });

  it('throws on missing properties', async () => {
    expect(await throwsMessage('{a: 1}.b')).toBe("Undefined property 'b'.");
  });

  it('throws when the target is not an object', async () => {
    expect(await throwsMessage('[1, 2].a')).toBe('Only objects have properties.');
  });
});

describe('conditionals', () => {
  it('evaluates if/else branches', async () => {
    expect(await evaluateValue('if (true) 1 else 2')).toEqual(numValue(1));
    expect(await evaluateValue('if (false) 1 else 2')).toEqual(numValue(2));
    expect(await evaluateValue('if (false) 1')).toEqual(nil);
    expect(await evaluateValue('if (false) 1 else if (true) 2 else 3')).toEqual(numValue(2));
  });

  it('uses glu truthiness for conditions', async () => {
    expect(await evaluateValue('if (1) "yes" else "no"')).toEqual(str('yes'));
    expect(await evaluateValue('if (nil) 1 else 2')).toEqual(numValue(2));
  });

  it('supports blocks in if expressions', async () => {
    expect(
      await evaluateValue('if ({ let x = 5; x > 3 }) { let y = 10; y * 2 } else { 0 }'),
    ).toEqual(numValue(20));
  });
});

describe('closures and calls', () => {
  it('captures the defining environment', async () => {
    expect(await evaluateValue('{ let z = 10; let f = |x| x + z; f(5) }')).toEqual(numValue(15));
  });

  it('calls closures with the right arity', async () => {
    expect(await evaluateValue('(|x| x + 1)(5)')).toEqual(numValue(6));
    expect(await evaluateValue('(|x, y| x + y)(3, 4)')).toEqual(numValue(7));
    expect(await evaluateValue('(|| 42)()')).toEqual(numValue(42));
  });

  it('throws on wrong argument counts', async () => {
    expect(await throwsMessage('(|x, y| x + y)(1)')).toBe('Expected 2 argument(s) but got 1.');
    expect(await throwsMessage('(|x| x)(1, 2)')).toBe('Expected 1 argument(s) but got 2.');
  });

  it('throws when calling a non-closure', async () => {
    expect(await throwsMessage('(1)(2)')).toBe('Only closures and native functions can be called.');
  });

  it('supports chained closure calls', async () => {
    expect(await evaluateValue('(|x| |y| x + y)(3)(4)')).toEqual(numValue(7));
  });

  it('throws when recursion depth is exceeded', async () => {
    expect(await throwsMessage('{ let f = |n| f(n + 1); f(0) }')).toBe(
      'Recursion limit of 256 exceeded.',
    );
  });
});

describe('operators', () => {
  it('requires two numbers or two strings for addition', async () => {
    expect(await throwsMessage('1 + "a"')).toBe('Operands must be two numbers or two strings.');
  });

  it('compares values for equality', async () => {
    expect(await evaluateValue('1 == 1')).toEqual(bool(true));
    expect(await evaluateValue('1 != 2')).toEqual(bool(true));
    expect(await evaluateValue('"a" == "a"')).toEqual(bool(true));
    expect(await evaluateValue('[1, 2] == [1, 2]')).toEqual(bool(true));
    expect(await evaluateValue('{a: 1} == {a: 1}')).toEqual(bool(true));
  });
});

describe('async natives', () => {
  it('awaits promise-returning native functions', async () => {
    const evaluator = new Evaluator();
    evaluator.registerNative('fetchId', 0, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return numValue(42);
    });
    await expect(evaluator.evaluate(parse('fetchId() + 1'))).resolves.toEqual(numValue(43));
  });

  it('mixes async natives with closures', async () => {
    const evaluator = new Evaluator();
    evaluator.registerNative('delayedDouble', 1, async (_eval, args) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (args[0].tag !== 'number') {
        throw new Error('Expected number');
      }
      return numValue(args[0].value * 2);
    });
    await expect(
      evaluator.evaluate(parse('{ let f = |x| delayedDouble(x) + 1; f(20) }')),
    ).resolves.toEqual(numValue(41));
  });

  it('runs the stdlib on an async-aware evaluator', async () => {
    expect(await evaluateValue('map([1, 2, 3], |x| x * x)')).toEqual(
      list([numValue(1), numValue(4), numValue(9)]),
    );
  });
});

describe('stdlib', () => {
  it('implements map, filter, fold, and reduce', async () => {
    expect(await evaluateValue('map([1, 2, 3], |x| x * 2)')).toEqual(
      list([numValue(2), numValue(4), numValue(6)]),
    );
    expect(await evaluateValue('filter([1, 2, 3, 4], |x| x > 2)')).toEqual(
      list([numValue(3), numValue(4)]),
    );
    expect(await evaluateValue('fold([1, 2, 3], 0, |acc, x| acc + x)')).toEqual(numValue(6));
    expect(await evaluateValue('reduce([1, 2, 3], |acc, x| acc + x)')).toEqual(numValue(6));
  });

  it('implements any, every, and find', async () => {
    expect(await evaluateValue('any([1, 2, 3], |x| x > 2)')).toEqual(bool(true));
    expect(await evaluateValue('every([1, 2, 3], |x| x > 2)')).toEqual(bool(false));
    expect(await evaluateValue('find([1, 2, 3], |x| x > 1)')).toEqual(numValue(2));
    expect(await evaluateValue('find([1, 2, 3], |x| x > 9)')).toEqual(nil);
  });

  it('implements range, len, keys, and values', async () => {
    expect(await evaluateValue('range(1, 4)')).toEqual(
      list([numValue(1), numValue(2), numValue(3)]),
    );
    expect(await evaluateValue('range(2, 2)')).toEqual(list([]));
    expect(await evaluateValue('range(4, 2)')).toEqual(list([]));
    expect(await evaluateValue('len([1, 2, 3])')).toEqual(numValue(3));
    expect(await evaluateValue('len([])')).toEqual(numValue(0));
    expect(await evaluateValue('len("hello")')).toEqual(numValue(5));
    expect(await evaluateValue('len("")')).toEqual(numValue(0));
    expect(await evaluateValue('keys({a: 1, b: 2})')).toEqual(list([str('a'), str('b')]));
    expect(await evaluateValue('values({a: 1, b: 2})')).toEqual(list([numValue(1), numValue(2)]));
  });

  it('validates stdlib argument types', async () => {
    expect(await throwsMessage('range("a", 3)')).toBe('Expected numbers');
    expect(await throwsMessage('range(1.5, 3)')).toBe('Expected integers');
    expect(await throwsMessage('len(1)')).toBe('Expected array or string');
    expect(await throwsMessage('keys([1, 2])')).toBe('Expected object');
    expect(await throwsMessage('values(nil)')).toBe('Expected object');
  });
});

describe('examples', () => {
  it('computes factorials with recursion', async () => {
    expect(
      await evaluateValue(`{
      let fact = |n| if (n <= 1) 1 else n * fact(n - 1);
      [fact(1), fact(2), fact(3), fact(4), fact(5), fact(6)]
    }`),
    ).toEqual(
      list([numValue(1), numValue(2), numValue(6), numValue(24), numValue(120), numValue(720)]),
    );
  });

  it('supports mutual recursion', async () => {
    expect(
      await evaluateValue(`{
      let fa = |n| if (n == 0) true else fb(n - 1);
      let fb = |n| if (n == 0) false else fa(n - 1);
      let isEven = |n| fa(n);
      isEven(101)
    }`),
    ).toEqual(bool(false));
  });

  it('implements recursion via a fixed-point combinator', async () => {
    expect(
      await evaluateValue(`{
      let fix = |f| |x| f(fix(f))(x);
      let fact_f = |f| |n| if (n <= 1) 1 else n * f(n - 1);
      let fact = fix(fact_f);
      fact(5)
    }`),
    ).toEqual(numValue(120));
  });
});
