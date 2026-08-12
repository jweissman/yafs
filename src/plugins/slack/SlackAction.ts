export type SlackAction = { message: string; actionId?: string };
type RawAction = { message?: unknown; actionId?: unknown };

export function parseSlackAction(payload: string): SlackAction {
  const value = JSON.parse(payload) as RawAction;
  assertValid(value, payload);
  const { message, actionId } = value;
  return { message: message as string, actionId: actionId as string };
}

function assertValid(value: RawAction, payload: string): void {
  const badMessage = typeof value.message !== "string";
  const badActionId =
    value.actionId !== undefined && typeof value.actionId !== "string";
  if (badMessage || badActionId) {
    throw new Error(`Invalid slack action: ${payload}`);
  }
}
