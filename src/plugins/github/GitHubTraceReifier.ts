import { Trace, TraceReifier } from "../../traces/TraceService";
import {
  GitHubPullFetcher,
  GitHubResourceReference,
  pullFile,
} from "./GitHubCollectionSource";
import { githubSettings } from "./GitHubSettings";
import { GitHubApiClient } from "./GitHubApiClient";

export class GitHubTraceReifier implements TraceReifier {
  constructor(private readonly client: GitHubPullFetcher) {}

  async reify(trace: Trace, digest: string): Promise<Uint8Array | undefined> {
    const entry = trace.entries.find(
      (candidate) => candidate.digest === digest,
    );
    const reference = this.reference(trace);
    return entry && reference ? this.bytes(reference, entry.path) : undefined;
  }

  private async bytes(reference: GitHubResourceReference, path: string) {
    const pull = await this.client.pull(reference.repository, reference.number);
    const content = pullFile(pull, path);
    return content === undefined
      ? undefined
      : new TextEncoder().encode(content);
  }

  private reference(trace: Trace): GitHubResourceReference | undefined {
    const reference = trace.resourceReference as
      GitHubResourceReference | undefined;
    return reference?.kind === "github-pr" ? reference : undefined;
  }
}

export function defaultTraceReifier(settings = githubSettings()): TraceReifier {
  return new GitHubTraceReifier(new GitHubApiClient(settings));
}
