export class GluError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GluError';
  }
}

export type GluParseErrorItem = {
  line: number;
  lexeme: string | undefined;
  message: string;
};

function formatGluParseErrorItem(e: GluParseErrorItem): string {
  let output = `[line ${e.line}]`;
  if (e.lexeme) {
    output += ` at ${e.lexeme}`;
  }
  output += `: ${e.message}`;

  return output;
}

export class GluParseError extends GluError {
  constructor(readonly errors: GluParseErrorItem[]) {
    const errorDescriptions = errors.map(formatGluParseErrorItem).join('\n');
    super(`Error while parsing:\n${errorDescriptions}`);
    this.name = 'GluParseError';
  }
}

export class GluEvalError extends GluError {
  constructor(message: string) {
    super(message);
    this.name = 'GluEvalError';
  }
}

export class GluConversionError extends GluError {
  constructor(message: string) {
    super(message);
    this.name = 'GluConversionError';
  }
}

export class GluPanicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GluPanicError';
  }
}
