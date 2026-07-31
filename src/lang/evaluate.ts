import { Expression } from '../types/Expression';
import { Word } from './Word';

export function evaluateExpression(expression: Expression): number {
  if (expression.kind === 'number') return expression.value; const left = evaluateExpression(expression.left);
  const right = evaluateExpression(expression.right);
  return expression.operator === '+' ? left + right : left - right;
}

export function evaluateWord(word: Word, variable: (name: string) => string): string {
  if (word.kind === 'literal') return word.value; if (word.kind === 'variable') return variable(word.name);
  if (word.kind === 'compound') return word.parts.map(part => evaluateWord(part, variable)).join('');
  return String(evaluateExpression(word.expression));
}
