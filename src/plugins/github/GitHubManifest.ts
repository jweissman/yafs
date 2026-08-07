import { GitHubConfig } from "../../mounts/types";
import { object, only } from "../../mounts/ManifestValidation";

export function githubConfig(value: unknown): GitHubConfig {
  const config = object(value, "github config");
  only(config, ["repository", "query", "max"], "github config");
  return validated(config);
}

function validated(config: Record<string, unknown>): GitHubConfig {
  const max = config.max;
  if (!valid(config.repository, config.query, max)) {
    throw new Error("Invalid github config");
  }
  return {
    repository: config.repository as string,
    query: config.query as string,
    max: max as number,
  };
}

function valid(repositoryValue: unknown, query: unknown, max: unknown) {
  return (
    repository(repositoryValue) &&
    typeof query === "string" &&
    Number.isInteger(max) &&
    typeof max === "number" &&
    max >= 1 &&
    max <= 100
  );
}

function repository(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
  );
}
