export function searchSummary(
  item: { number: number; title: string; updated_at: string },
  headSha: string,
) {
  const { number, title, updated_at: updatedAt } = item;
  return { number, title, updatedAt, headSha };
}
