const units: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};

export function duration(value: string) {
  const matched = /^(\d+)(ms|s|m|h)$/.exec(value);
  if (!matched) {
    throw new Error("Invalid cache TTL");
  }
  return Number(matched[1]) * (units[matched[2]] || 0);
}
