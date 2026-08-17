import { FSNode } from "./FSNode";

export function linkTarget(
  link: FSNode,
  origin: FSNode,
  pathOf: (node: FSNode) => string,
): string {
  const target = requiredTarget(link);
  return target.startsWith("/") ? target : `${pathOf(link.parent ?? origin)}/${target}`;
}

function requiredTarget(link: FSNode): string {
  if (!link.symlinkTarget) {
    throw new Error("Invalid symlink without target");
  }
  return link.symlinkTarget;
}
