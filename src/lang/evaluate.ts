import { Expression } from "../types/Expression";
import { Word } from "./Word";
import { Command } from "../types/Command";

export type Evaluators<T> = {
  variable: (name: string) => string;
  substitute: (command: Command) => T;
};

export function evaluateExpression(expression: Expression): number {
  if (expression.kind === "number") {
    return expression.value;
  }
  const left = evaluateExpression(expression.left);
  const right = evaluateExpression(expression.right);
  return expression.operator === "+" ? left + right : left - right;
}

type SimpleWord = Extract<Word, { kind: "literal" | "variable" }>;

export function evaluateWord(
  word: Word,
  evaluators: Evaluators<string>,
): string {
  if (word.kind === "literal" || word.kind === "variable") {
    return simpleWord(word, evaluators);
  }
  return complexWord(word, evaluators);
}

function complexWord(
  word: Exclude<Word, { kind: "literal" | "variable" }>,
  evaluators: Evaluators<string>,
): string {
  return word.kind === "compound"
    ? compound(word.parts, evaluators)
    : expansion(word, evaluators);
}

function compound(parts: Word[], evaluators: Evaluators<string>) {
  return parts.map((part) => evaluateWord(part, evaluators)).join("");
}

export async function evaluateWordAsync(
  word: Word,
  evaluators: Evaluators<Promise<string>>,
): Promise<string> {
  if (word.kind === "literal" || word.kind === "variable") {
    return simpleWord(word, evaluators);
  }
  return complexWordAsync(word, evaluators);
}

async function complexWordAsync(
  word: Exclude<Word, { kind: "literal" | "variable" }>,
  evaluators: Evaluators<Promise<string>>,
): Promise<string> {
  return word.kind === "compound"
    ? compoundAsync(word.parts, evaluators)
    : substitutionOrExpression(word, evaluators);
}

function substitutionOrExpression(
  word: Exclude<Word, { kind: "literal" | "variable" | "compound" }>,
  evaluators: Evaluators<Promise<string>>,
) {
  return word.kind === "substitution"
    ? evaluators.substitute(word.command)
    : String(evaluateExpression(word.expression));
}

function simpleWord<T>(word: SimpleWord, evaluators: Evaluators<T>): string {
  return word.kind === "literal" ? word.value : evaluators.variable(word.name);
}

async function compoundAsync(
  parts: Word[],
  evaluators: Evaluators<Promise<string>>,
) {
  const evaluated = await Promise.all(
    parts.map((part) => evaluateWordAsync(part, evaluators)),
  );
  return evaluated.join("");
}

function expansion(
  word: Exclude<Word, { kind: "literal" | "variable" | "compound" }>,
  evaluators: Evaluators<string>,
) {
  return word.kind === "substitution"
    ? evaluators.substitute(word.command)
    : String(evaluateExpression(word.expression));
}
