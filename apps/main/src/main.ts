import { compile } from '@glu-script/core';
import { createInterface } from 'node:readline';

const PROMPT = 'glu> ';
const CONTINUATION_PROMPT = '...  ';

async function evaluateInput(source: string): Promise<void> {
  try {
    const value = await compile(source)();
    console.log(value);
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
  }
}

async function main() {
  console.log(
    'glu-script REPL — enter an expression, evaluate with an empty line, quit with :quit',
  );

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
  });

  rl.prompt();

  let buffer: string[] = [];

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed === ':quit' || trimmed === ':exit') {
      break;
    }

    if (trimmed === '' && buffer.length > 0) {
      const source = buffer.join('\n');
      buffer = [];
      await evaluateInput(source);
      rl.setPrompt(PROMPT);
      rl.prompt();
      continue;
    }

    buffer.push(line);
    rl.setPrompt(CONTINUATION_PROMPT);
    rl.prompt();
  }

  console.log('bye');
}

main();
