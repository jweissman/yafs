import { CommandHistory } from "./history";

export function print(output: string) {
  if (output) {
    console.log(output);
  }
}

export function printHistory(history: CommandHistory) {
  history
    .entries()
    .forEach((entry, index) => console.log(`${index + 1}  ${entry}`));
}
