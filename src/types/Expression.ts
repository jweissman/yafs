export type Expression =
  | { kind: "number"; value: number }
  | {
      kind: "binary";
      operator: "+" | "-";
      left: Expression;
      right: Expression;
    };
