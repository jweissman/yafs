export function githubWorldDescription(): string {
  return pullsDescription() + commitsDescription() + sourceDescription();
}

function pullsDescription(): string {
  return (
    "GitHub PR collection: pulls/<number>/{metadata.json,diff.patch}. " +
    "This mount's own path names the owner/repo (/world/github/<owner>/" +
    "<repo>) -- cite a PR as https://github.com/<owner>/<repo>/pull/<number> " +
    '(singular "pull", not the "pulls/" directory name). '
  );
}

function commitsDescription(): string {
  return (
    "Also publishes a bounded recent-commits log: " +
    "commits/<sha>/metadata.json (author, message, and ciStatus -- a " +
    "combined success/failure/pending/none reduction of that commit's " +
    "check runs). "
  );
}

function sourceDescription(): string {
  return (
    "If granted host.git-read, also publishes source/ -- the real " +
    "repository tree at a pinned commit, browsable with ordinary ls/tree/" +
    "cat/grep/find. Reading it never writes anything or makes an " +
    "uncontrolled network call; it only ever reflects the last refresh."
  );
}
