export type Rule = { id: number; categoryId: number | null; siteId: number | null; assigneeId: string | null; position: number };

/** First rule (by position) whose category and site match. Null fields match anything. */
export function matchRule(rules: Rule[], t: { categoryId: number | null; siteId: number | null }) {
  const sorted = [...rules].sort((a, b) => a.position - b.position || a.id - b.id);
  return (
    sorted.find(
      (r) => (r.categoryId === null || r.categoryId === t.categoryId) && (r.siteId === null || r.siteId === t.siteId),
    ) ?? null
  );
}

export function pickAssignee(rules: Rule[], t: { categoryId: number | null; siteId: number | null }) {
  return matchRule(rules, t)?.assigneeId ?? null;
}
