// Vercel Web Analytics sees page paths only. Save and asset IDs are private,
// so their pages are counted under one shared path; query strings and hashes
// are dropped. Public story and shared StoryNode paths stay as they are.
const privatePaths: Array<[RegExp, string]> = [
  [/^\/play\/[^/]+/, "/play/[saveId]"],
  [/^\/assets\/edit\/[^/]+/, "/assets/edit/[assetId]"],
];

export function analyticsUrl(url: string): string {
  const parsed = new URL(url);
  let path = parsed.pathname;
  for (const [pattern, replacement] of privatePaths)
    path = path.replace(pattern, replacement);
  return `${parsed.origin}${path}`;
}
