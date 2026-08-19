import { GitHubConfig } from "../../mounts/types";
import { object, only } from "../../mounts/ManifestValidation";

export function githubConfig(value: unknown): GitHubConfig {
  const config = object(value, "github config");
  only(config, ["repository", "pulls", "commits"], "github config");
  return validated(config);
}

function validated(config: Record<string, unknown>): GitHubConfig {
  const { repository, pulls, commits } = config;
  if (!valid(repository, pulls, commits)) {
    throw new Error("Invalid github config");
  }
  return { repository, pulls, commits } as GitHubConfig;
}

function valid(repository: unknown, pulls: unknown, commits: unknown) {
  return (
    repositoryValid(repository) && validPulls(pulls) && validCommits(commits)
  );
}

function repositoryValid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)
  );
}

function boundedInteger(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 100
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validPulls(pulls: unknown): boolean {
  if (!isRecord(pulls)) {
    return pulls === undefined;
  }
  return (
    Object.keys(pulls).length === 2 &&
    typeof pulls.query === "string" &&
    boundedInteger(pulls.max)
  );
}

function validCommits(commits: unknown): boolean {
  if (!isRecord(commits)) {
    return commits === undefined;
  }
  return Object.keys(commits).length === 1 && boundedInteger(commits.max);
}
