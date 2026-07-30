export type PromptSession = { user: string, cwd: string }

export function renderPrompt(template: string, session: PromptSession, server: string): string {
  return template.replace(/\{(user|cwd|server)\}/g, (_match, name: string) => {
    if (name === 'user') return session.user
    if (name === 'cwd') return session.cwd
    return server
  })
}
