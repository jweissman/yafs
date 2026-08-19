import { Citation, CitationRenderer } from "../../mounts/Plugin";
import { GitHubResourceReference } from "./GitHubCollectionSource";

export function githubCitationRenderer(): CitationRenderer {
  return { kind: "github-pr", render };
}

function render(reference: object): Citation | undefined {
  return isGithubReference(reference) ? citation(reference) : undefined;
}

type ReferenceFields = Partial<Record<keyof GitHubResourceReference, unknown>>;

function isGithubReference(
  reference: object,
): reference is GitHubResourceReference {
  return hasRequiredFields(reference);
}

function hasRequiredFields(fields: ReferenceFields): boolean {
  const { repository, number, title, url } = fields;
  return (
    typeof repository === "string" &&
    typeof number === "number" &&
    typeof title === "string" &&
    typeof url === "string"
  );
}

function citation(reference: GitHubResourceReference): Citation {
  const { repository, number, title, url } = reference;
  return {
    key: `${repository}#${String(number)}`,
    url,
    label: `#${String(number)} ${title}`,
  };
}
