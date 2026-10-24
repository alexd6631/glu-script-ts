import { GluPanicError, GluParseErrorItem } from './errors.js';
import { Scanner, type Token, type TokenType } from './scanner.js';

export class Parser {
  private readonly scanner: Scanner;
  private current: Token | null = null;
  private previous: Token | null = null;
  private panicMode = false;
  hadError = false;
  errors: GluParseErrorItem[] = [];

  constructor(scanner: Scanner) {
    this.scanner = scanner;
  }

  advance(): void {
    this.previous = this.current;
    for (;;) {
      this.current = this.scanner.scanToken();
      if (this.current.kind !== 'error') {
        break;
      }
      this.errorAtCurrent(this.current.lexeme);
    }
  }

  consume(kind: TokenType, message: string): void {
    if (this.current?.kind === kind) {
      this.advance();
      return;
    }
    this.errorAtCurrent(message);
  }

  matches(kind: TokenType): boolean {
    if (!this.check(kind)) {
      return false;
    }
    this.advance();
    return true;
  }

  check(kind: TokenType): boolean {
    return this.getCurrent().kind === kind;
  }

  getCurrent(): Token {
    if (this.current === null) {
      throw new GluPanicError('Parser accessed before advance()');
    }
    return this.current;
  }

  getPrevious(): Token {
    if (this.previous === null) {
      throw new GluPanicError('Parser has no previous token');
    }
    return this.previous;
  }

  errorAtCurrent(message: string): void {
    this.errorAt(this.getCurrent(), message);
  }

  errorAt(token: Token, message: string): void {
    if (this.panicMode) {
      return;
    }
    this.panicMode = true;
    let lexeme: string | undefined;
    if (token.kind === 'eof') {
      lexeme = 'end';
    } else if (token.kind !== 'error') {
      lexeme = `'${token.lexeme}'`;
    }

    this.errors.push({ line: token.line, lexeme, message });
    this.hadError = true;
  }

  clone(): Parser {
    const parser = new Parser(this.scanner.clone());
    parser.current = this.current;
    parser.previous = this.previous;
    parser.hadError = this.hadError;
    parser.panicMode = this.panicMode;
    parser.errors = [...this.errors];
    return parser;
  }
}
