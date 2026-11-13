export interface ChangelogEntry {
  version: string;
  date: string;
  title?: string;
  bullets: string[];
  isLegacy?: boolean;
}

export function releaseNotesMarkdown(releases: Array<{ version?: string; tag_name?: string; date?: string; published_at?: string; body?: string }>): string {
  return releases.flatMap((release) => {
    const version = String(release.version || release.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version) || !release.body) return [];
    const date = release.date || (release.published_at
      ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(release.published_at)) : '');
    const body = release.body.split(/\r?\n/).filter((line) => !/^#{1,2}\s+/.test(line) || !line.includes(version))
      .map((line) => line.replace(/^#{1,6}\s+/, '### ')).join('\n');
    return [`## ${version}${date ? ` - ${date}` : ''}\n\n${body}`];
  }).join('\n\n');
}

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current) entries.push(current);
      const match = heading[1].match(/^(\S+)(?:\s+-\s+(.+))?$/);
      current = {
        version: match?.[1] ?? heading[1],
        date: match?.[2] ?? '',
        bullets: [],
      };
      continue;
    }

    if (!current) continue;
    const subheading = line.match(/^###\s+(.+?)\s*$/);
    if (subheading) {
      current.title = current.title ? `${current.title} · ${subheading[1]}` : subheading[1];
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (bullet) current.bullets.push(bullet[1]);
  }

  if (current) entries.push(current);

  const currentEntries = entries
    .filter((entry) => /^0\.0\.\d+/.test(entry.version))
    .sort((a, b) => compareVersions(b.version, a.version));
  const legacyEntries = entries
    .filter((entry) => /^2\.\d+\.\d+/.test(entry.version))
    .map((entry) => ({ ...entry, isLegacy: true }));
  const otherEntries = entries.filter(
    (entry) => !/^0\.0\.\d+/.test(entry.version) && !/^2\.\d+\.\d+/.test(entry.version),
  );

  return currentEntries.length > 0
    ? [...currentEntries, ...legacyEntries, ...otherEntries]
    : entries;
}

function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
