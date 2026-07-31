import { Expression } from '../types/Expression';
import { Word } from './Word';

export function evaluateExpression(expression: Expression): number {
  if (expression.kind === 'number') return expression.value; const left = evaluateExpression(expression.left);
  const right = evaluateExpression(expression.right);
  return expression.operator === '+' ? left + right : left - right;
}

export function evaluateWord(word: Word, variable: (name: string) => string, substitute: (command: import('../types/Command').Command) => string): string {
  if (word.kind === 'literal') return word.value; if (word.kind === 'variable') return variable(word.name);
  if (word.kind === 'compound') return word.parts.map(part => evaluateWord(part, variable, substitute)).join('');
  return expansion(word, substitute)
}

function expansion(word: Exclude<Word, { kind: 'literal' | 'variable' | 'compound' }>, substitute: (command: import('../types/Command').Command) => string) {
  return word.kind === 'substitution' ? substitute(word.command) : String(evaluateExpression(word.expression))
}
