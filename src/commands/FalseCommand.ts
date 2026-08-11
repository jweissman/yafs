export class FalseCommand {
  readonly name = "false";
  readonly synopsis = "false";
  readonly access = "read";
  constructor() {}
  execute(): string {
    throw new Error("false");
  }
}
