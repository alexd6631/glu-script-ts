# @glu-script/core

A small, expression-oriented scripting language, implemented in TypeScript.

The scanner, Pratt-parser, AST and asynchronous tree-walking evaluator live in
`src/lib/`. The public API is `compile()`, which turns a GluScript source string
into an async function that maps a JS input record to a JS result.

This package is part of a [pnpm](https://pnpm.io) workspace (see
`pnpm-workspace.yaml`; `packages/*` and `apps/*` are workspace members).

## Building

From the package or workspace directory:

```
pnpm build
```

## Running unit tests

```
pnpm test
```

`pnpm format` (oxfmt) and `pnpm lint` (oxlint) are also available at both
levels.

## Using the library

```ts
import { compile } from '@glu-script/core';

const run = compile(`{
  let sum = x + y;
  {
    sum: sum,
    mul: sum * y
  }
}`);

await run({ x: 42, y: 2 }); // { sum: 44, mul: 88 }
```

`compile(source)` parses once and returns an async function. Each call of that
function evaluates the program against a fresh `Evaluator` seeded with the
given input record (converted from plain JS values) and converts the result
back to plain JS.

Host functions can be injected as a second argument to `compile`. They become
callable globals inside the script, receive plain JS arguments (GluScript
values are converted on the way in), may be async, and their return value is
converted back to GluScript. Arity is taken from the function's `length`:

```ts
const run = compile(
  `{
    let user1 = fetchUserId(userIds[0]);
    let user2 = fetchUserId(userIds[1]);

    [user1, user2]
  }`,
  {
    fetchUserId: async (userId: string) => ({ id: userId }),
  },
);

await run({ userIds: ['user1', 'user2'] }); // [{ id: 'user1' }, { id: 'user2' }]
```

A REPL lives in `apps/main` to experiment with the library.

## Syntax primer

### Everything is one expression

A GluScript program is a single expression. There are no statements, only
expressions; a block evaluates to the value of its last expression.

```glu
1 + 2
```

### Values

| Literal | Example                                |
| ------- | -------------------------------------- |
| number  | `42`, `2.5` (a bare `.5` is not valid) |
| string  | `"hello"` (double quotes, no escapes)  |
| bool    | `true`, `false`                        |
| nil     | `nil`                                  |
| list    | `[1, "two", [3]]`                      |
| object  | `{ name: "glu", year: 2026 }`          |
| closure | `\|x, y\| x + y`                       |

- Comments start with `//` and run to the end of the line.
- Strings have no escape sequences; a double quote cannot appear inside a
  string literal. They may span multiple lines.
- Object keys may be identifiers (`{ a: 1 }`), strings (`{ "a b": 1 }`), or
  computed (`{ ["a" + "b"]: 1 }`).

### Blocks and objects share `{ }`

A `{` starts a block, unless the parser can tell it is an object literal
(the first token is `identifier:` or `"string":`, or the lookahead matches
`[ ... ]:`). Blocks use `;` as the separator, objects use `,`. Neither allows
a trailing separator.

```glu
{
  let x = 1;   // binding
  let y = 2;   // binding
  x + y        // last expression is the block's value: 3
}
```

An empty `{}` is an empty block and evaluates to `nil`.

### Bindings

`let name = expr` is itself an expression that evaluates to the bound value.
Bindings are single-assignment: there is no reassignment (`=` only appears in
`let`). Each block opens a new lexical scope; bindings do not escape it, and
nested blocks can shadow outer names.

```glu
{ let x = 5 }              // 5
{ let x = 1; { let x = 2; x } + x }  // 3
```

Referencing an undefined name is a runtime error.

### Operators

Precedence, lowest to highest:

| Level      | Operators                 | Associativity |
| ---------- | ------------------------- | ------------- |
| or         | `or`                      | left          |
| and        | `and`                     | left          |
| equality   | `==` `!=`                 | left          |
| comparison | `<` `<=` `>` `>=`         | left          |
| term       | `+` `-`                   | left          |
| factor     | `*` `/` `%`               | left          |
| unary      | `!` (not) `-` (negate)    | prefix        |
| call/index | `f(x)` `a[i]` `obj.field` | left          |

- `+` adds numbers or concatenates two strings; everything else is numbers-only.
- `==` / `!=` compare structurally (lists and objects compare by contents).
- `and` / `or` short-circuit and return an operand (like Lua/JS):
  `a and b` yields `a` if `a` is falsy, else `b`; `a or b` yields `a` if `a`
  is truthy, else `b`.
- Only `nil` and `false` are falsy — `0` and `""` are truthy.

### If is an expression

`if (cond) thenExpr` optionally followed by `else elseExpr`. A missing else
yields `nil`. Because `if` is itself an expression, `else if` chains work
naturally.

```glu
if (x > 0) "positive" else "non-positive"
```

### Closures and calls

Closures use Ruby-style `|params| body` syntax; `||` declares no parameters.
Closures capture their defining environment (lexical scoping) and are
first-class values. Calls use `callee(arg, ...)`; arity is checked at call
time. Recursion is supported up to a call depth of 256.

```glu
{
  let add = |a, b| a + b;
  let double = |x| add(x, x);
  double(21)      // 42
}
```

### Access

- `list[i]` and `string[i]` are zero-based; the index must be a non-negative
  integer and within range, otherwise a runtime error is thrown. Objects are
  not indexable.
- `obj.field` reads an object property; missing properties are a runtime
  error.
- Accesses chain left to right: `[[1, 2], [3, 4]][1][0]` is `3`.

### Built-in functions

| Function                          | Description                                                     |
| --------------------------------- | --------------------------------------------------------------- |
| `range(a, b)`                     | list of integers `a` to `b` (exclusive); requires integers      |
| `len(list_or_string)`             | length                                                          |
| `keys(object)` / `values(object)` | list of an object's keys / values                               |
| `map(list, f)`                    | new list with `f` applied to each item                          |
| `filter(list, f)`                 | items for which `f` is truthy                                   |
| `fold(list, init, f)`             | left fold: `f(f(f(init, x0), x1), x2)...`                       |
| `reduce(list, f)`                 | like `fold` seeded with the first item; errors on an empty list |
| `any(list, f)` / `every(list, f)` | existential / universal test                                    |
| `find(list, f)`                   | first matching item, else `nil`                                 |

```glu
fold(map(range(0, 5), |x| x * 2), 0, |acc, x| acc + x)  // 20
```

### JavaScript interop

`compile(source, runtime?)` returns `async (input?: Record<string, unknown>) => unknown`.

- Input record values convert: `null`/`undefined` → `nil`, arrays → lists,
  plain objects → objects. Class instances and symbol-keyed records are
  rejected.
- Results convert back: `nil` → `undefined`, lists → arrays, objects → plain
  records, closures → `'<closure>'`, native functions → `'<native_fn>'`.
- `runtime` functions are exposed as native functions under their record key,
  with arity from `f.length`. Arguments and return values cross the boundary
  as plain JS values; the wrapper awaits, so sync and async functions both
  work. A GluScript closure passed to a host function arrives as the string
  `'<closure>'` — host functions cannot call back into GluScript closures.
- For lower-level control, import the internals directly (they ship in
  `dist/lib/...`): `parse` from `lib/compiler.js`, the `Evaluator` class from
  `lib/evaluator.js` (`registerGlobal`, `registerNative`, `evaluate`), and the
  value constructors from `lib/value.js`. The package entry point itself only
  re-exports `compile` and the error classes.

### Reserved but not implemented

The words `print`, `while`, `for`, `fun`, `switch`, `case` and `default` are
tokenized as keywords but have no grammar yet — using them is a parse error.
