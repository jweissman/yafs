import { VERSION } from "../core/version";

export class VersionCommand {
  readonly name = "version";
  readonly synopsis = "version";
  readonly access = "read";
  constructor() {}
  execute() {
    return `yafs ${VERSION}`;
  }
}
