import { WorkspaceOperation } from "../operations/WorkspaceOperation";

export type Scopable = Exclude<WorkspaceOperation, { name: "startHere" }>;

export function pathsOf(request: Scopable): string[] {
  if (request.name === "diff") {
    return [request.left, request.right];
  }
  return request.name === "grep" ? request.paths : pathsOfOther(request);
}

type Other = Exclude<Scopable, { name: "diff" | "grep" }>;

function pathsOfOther(request: Other): string[] {
  if (request.name === "capture") {
    return [request.source];
  }
  return request.name === "restore" ? [request.destination] : [request.path];
}
