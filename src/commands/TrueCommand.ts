export class TrueCommand {
  readonly name = "true";
  readonly synopsis = "true";
  readonly access = "read";
  constructor() {}
  execute() {
    return "";
  }
}
