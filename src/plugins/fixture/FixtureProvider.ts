import { FixtureConfig } from "../../mounts/types";

export class FixtureProvider {
  constructor(private readonly files: Record<string, string>) {}

  read(path: string): string {
    if (!Object.hasOwn(this.files, path)) {
      throw new Error(`No such file: ${path}`);
    }
    return this.files[path];
  }

  list(path: string): string[] {
    const prefix = path ? `${path}/` : "";
    const names = Object.keys(this.files)
      .filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length).split("/")[0]);
    return [...new Set(names)].sort();
  }

  type(path: string): "file" | "directory" {
    if (path in this.files) {
      return "file";
    }
    if (this.list(path).length) {
      return "directory";
    }
    throw new Error(`No such file: ${path}`);
  }

  entries() {
    return Object.entries(this.files);
  }

  static from(config: FixtureConfig) {
    return new FixtureProvider(config.files);
  }
}
