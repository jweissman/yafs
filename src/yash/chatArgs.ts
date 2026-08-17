export interface ChatArgs {
  persona?: string;
  contextPath?: string;
  chatId?: string;
}

export function parseChatArgs(rest: string): ChatArgs {
  const tokens = rest.split(/\s+/).filter(Boolean);
  const args: ChatArgs = {};
  for (let i = 0; i < tokens.length; i += flagLength(tokens[i])) {
    applyToken(args, tokens, i);
  }
  return args;
}

function flagLength(token: string): number {
  return token === "--context" || token === "--chat" ? 2 : 1;
}

function applyToken(args: ChatArgs, tokens: string[], i: number) {
  const token = tokens[i];
  if (token === "--context" || token === "--chat") {
    applyFlag(args, token, requireValue(tokens, i, token));
  } else if (token.startsWith("--")) {
    throw new Error(`Unknown agent chat flag: ${token}`);
  } else {
    applyPersona(args, token);
  }
}

function applyFlag(args: ChatArgs, flag: string, value: string) {
  if (flag === "--context") {
    args.contextPath = value;
  } else {
    args.chatId = value;
  }
}

function applyPersona(args: ChatArgs, token: string) {
  if (args.persona !== undefined) {
    throw new Error(`Unexpected agent chat argument: ${token}`);
  }
  args.persona = token;
}

function requireValue(tokens: string[], i: number, flag: string): string {
  const value = tokens.at(i + 1);
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
