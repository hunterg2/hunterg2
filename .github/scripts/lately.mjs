// Rewrites the Lately list in README.md from the hub's log feed: the five newest updates to a game
// or a Discord bot, newest first. Changes to the hub site itself are left out. Run by
// .github/workflows/lately.yml; by hand, `node .github/scripts/lately.mjs` from the repo root.
// A feed that is down, empty or has no game or bot entries changes nothing.
import { readFileSync, writeFileSync } from 'node:fs';

const FEED = 'https://hunnag.pages.dev/log.xml';
const HUB = 'https://hunnag.pages.dev/';
const COUNT = 5;
/** Characters of what changed before it is cut short with an ellipsis; the hub has the rest. */
const MAX = 160;
const START = '<!-- lately:start -->';
const END = '<!-- lately:end -->';

const unxml = (s) =>
  s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e]);
const field = (item, name) => unxml(item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '').trim();
/** Plain text in Markdown: nothing in a title may become a link, emphasis or HTML. */
const md = (s) => s.replace(/[\\`*_[\]<>]/g, (c) => `\\${c}`);
const short = (s) => (s.length <= MAX ? s : `${s.slice(0, s.lastIndexOf(' ', MAX - 1)).replace(/[,;:]$/, '')}…`);
/** Only links into the hub; anything else points at the log. */
const hubLink = (s) => {
  try {
    const u = new URL(s);
    return u.origin === new URL(HUB).origin ? u.href : `${HUB}log/`;
  } catch {
    return `${HUB}log/`;
  }
};

const res = await fetch(FEED);
if (!res.ok) throw new Error(`${FEED}: ${res.status}`);
const xml = await res.text();

const lines = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
  .map(([, item]) => ({
    title: field(item, 'title').replace(/\s+/g, ' '),
    link: hubLink(field(item, 'link')),
    date: new Date(field(item, 'pubDate')),
    category: field(item, 'category'),
  }))
  .filter((e) => (e.category === 'games' || e.category === 'bots') && e.title && !Number.isNaN(e.date.getTime()))
  .slice(0, COUNT)
  .map((e) => {
    const day = e.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    // A project's entry reads "Name: what changed" and links to the project's page; the name carries
    // the link. When what changed starts with the name again, that one becomes the link instead.
    const cut = e.title.indexOf(': ');
    if (/\/(games|bots|other)\/[^/]+\/$/.test(e.link) && cut > 0) {
      const name = e.title.slice(0, cut);
      const rest = e.title.slice(cut + 2);
      if (rest.startsWith(`${name} `)) return `- ${day} · [${md(name)}](${e.link}) ${md(short(rest.slice(name.length + 1)))}`;
      return `- ${day} · [${md(name)}](${e.link}): ${md(short(rest))}`;
    }
    return `- ${day} · [${md(short(e.title))}](${e.link})`;
  });
if (lines.length === 0) throw new Error(`${FEED}: no game or bot entries, so the list is left as it is`);

const readme = readFileSync('README.md', 'utf8');
const a = readme.indexOf(START);
const b = readme.indexOf(END);
if (a < 0 || b < a) throw new Error(`README.md: ${START} and ${END} are missing`);
const next = `${readme.slice(0, a + START.length)}\n${lines.join('\n')}\n${readme.slice(b)}`;
if (next === readme) {
  console.log('Nothing new.');
} else {
  writeFileSync('README.md', next);
  console.log(`Lately: ${lines.length} entries.\n${lines.join('\n')}`);
}
