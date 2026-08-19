import { CheckRun, CiStatus } from "./GitHubApiClientTypes";

export function combinedCiStatus(checkRuns: CheckRun[]): CiStatus {
  if (!checkRuns.length) {
    return "none";
  }
  if (checkRuns.some(failed)) {
    return "failure";
  }
  return checkRuns.some(unfinished) ? "pending" : "success";
}

function failed(run: CheckRun): boolean {
  return run.conclusion === "failure";
}

function unfinished(run: CheckRun): boolean {
  return run.status !== "completed";
}
