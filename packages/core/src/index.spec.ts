import { compile } from './index.js';

describe('compile', () => {
  it('should compile and evaluate simple expression', async () => {
    const compiledExpression = compile(`{
    let sum = x + y;
    let mul = x * y;
    {
      sum: sum,
      mul: mul
      }
    }`);

    expect(await compiledExpression({ x: 42, y: 2 })).toEqual({
      sum: 44,
      mul: 84,
    });
    expect(await compiledExpression({ x: 2, y: 2 })).toEqual({
      sum: 4,
      mul: 4,
    });
  });

  it('should compile and evaluate expression with additional runtime functions', async () => {
    const compiledExpression = compile(
      `{
      let user1 = fetchUserId(userIds[0]);
      let user2 = fetchUserId(userIds[1]);

      [user1, user2]
    }`,
      {
        fetchUserId: async (userId: string) => {
          return { id: userId };
        },
      },
    );

    const result = await compiledExpression({
      userIds: ['user1', 'user2'],
    });

    expect(result).toEqual([{ id: 'user1' }, { id: 'user2' }]);
  });

  it('should compile and evaluate expression with sync runtime functions', async () => {
    const compiledExpression = compile(
      `{
      let doubled = double(x);

      {
        doubled: doubled,
        upper: upper(name)
      }
    }`,
      {
        double: (n: number) => n * 2,
        upper: (s: string) => s.toUpperCase(),
      },
    );

    const result = await compiledExpression({ x: 21, name: 'glu' });

    expect(result).toEqual({ doubled: 42, upper: 'GLU' });
  });

  it('should handle unknown values as opaque types', async () => {
    const compiledExpression = compile(`{
      [in.date, in.regex]
    }`);

    const date = new Date();
    const regex = new RegExp('');

    const result = await compiledExpression({
      in: {
        date: date,
        regex: regex,
      },
    });

    expect(result).toEqual([date, regex]);
  });
});
