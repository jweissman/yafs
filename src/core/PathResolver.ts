import { AbsolutePath } from "./AbsolutePath";
import { User } from "../types/User";

export function normalize(path: string): string[] {
  return path.split("/").reduce(segment, []);
}

function segment(resolved: string[], value: string): string[] {
  if (!value || value === ".") {
    return resolved;
  }
  return value === ".." ? resolved.slice(0, -1) : [...resolved, value];
}

function home(user: User): AbsolutePath {
  return `/home/${user.name}` as AbsolutePath;
}

function resolve(path: string, current: AbsolutePath): AbsolutePath {
  return `/${normalize(path.startsWith("/") ? path : `${current}/${path}`).join("/")}`;
}

export const PathResolver = { home, resolve };
