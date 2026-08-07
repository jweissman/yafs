export type PromptSession = { user: string; cwd: string };

export function renderPrompt(
  template: string,
  session: PromptSession,
  server: string,
): string {
  return template.replace(/\{(user|cwd|server)\}/g, (_match, name: string) =>
    name === "user" ? session.user : name === "cwd" ? session.cwd : server,
  );
}
