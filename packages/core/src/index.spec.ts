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
});
