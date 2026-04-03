/**
 * Display name for dashboard / zone UI: Firebase `name`, legacy `label`, or bare node id.
 */
export function getSensorDisplayName(
  meta: { name?: string; label?: string } | undefined,
  nodeId: string
): string {
  if (!meta) return nodeId;
  const n = meta.name ?? meta.label;
  return n?.trim() ? String(n).trim() : nodeId;
}
