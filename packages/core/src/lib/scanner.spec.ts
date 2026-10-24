import { scan } from './scanner.js';

describe('scanner', () => {
  it('yields a single eof token for empty source', () => {
    expect(scan('')).toEqual([{ kind: 'eof', lexeme: '', line: 1 }]);
  });

  it('scans simple one-char lexemes', () => {
    expect(scan(' ( + . * )')).toEqual([
      { kind: 'leftParen', lexeme: '(', line: 1 },
      { kind: 'plus', lexeme: '+', line: 1 },
      { kind: 'dot', lexeme: '.', line: 1 },
      { kind: 'star', lexeme: '*', line: 1 },
      { kind: 'rightParen', lexeme: ')', line: 1 },
      { kind: 'eof', lexeme: '', line: 1 },
    ]);
  });

  it('scans two-char lexemes', () => {
    expect(scan('! != =')).toEqual([
      { kind: 'bang', lexeme: '!', line: 1 },
      { kind: 'bangEqual', lexeme: '!=', line: 1 },
      { kind: 'equal', lexeme: '=', line: 1 },
      { kind: 'eof', lexeme: '', line: 1 },
    ]);
  });

  it('tracks newlines and skips comments', () => {
    expect(scan('() // comment\n!= // comment\n.')).toEqual([
      { kind: 'leftParen', lexeme: '(', line: 1 },
      { kind: 'rightParen', lexeme: ')', line: 1 },
      { kind: 'bangEqual', lexeme: '!=', line: 2 },
      { kind: 'dot', lexeme: '.', line: 3 },
      { kind: 'eof', lexeme: '', line: 3 },
    ]);
  });

  it('scans multi-line strings and tracks their line', () => {
    expect(scan('("Hello\nworld")')).toEqual([
      { kind: 'leftParen', lexeme: '(', line: 1 },
      { kind: 'string', lexeme: '"Hello\nworld"', line: 2 },
      { kind: 'rightParen', lexeme: ')', line: 2 },
      { kind: 'eof', lexeme: '', line: 2 },
    ]);
  });

  it('scans numbers', () => {
    expect(scan('42,42.4,42.')).toEqual([
      { kind: 'number', lexeme: '42', line: 1 },
      { kind: 'comma', lexeme: ',', line: 1 },
      { kind: 'number', lexeme: '42.4', line: 1 },
      { kind: 'comma', lexeme: ',', line: 1 },
      { kind: 'number', lexeme: '42', line: 1 },
      { kind: 'dot', lexeme: '.', line: 1 },
      { kind: 'eof', lexeme: '', line: 1 },
    ]);
  });
});
