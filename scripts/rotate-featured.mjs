// Weekly "Featured sleeper" rotation, run by featured-card.yml every Sunday night Pacific.
//
// docs/featured.json holds the curator's batches of card slugs (see DATA-MODEL.md):
// - current: the batch being shown, one card per week from its startsOn Sunday
// - upcoming: the next batch, if the curator has sent one; it takes over when current runs out
// - showing: the card on the homepage now (sync-seo-index.mjs renders it)
// - history: every week's card, newest last
// When current runs out and nothing is upcoming, it loops back to its first card.
//
//   node scripts/rotate-featured.mjs   pick this week's card (safe to re-run: same week, same card)
//   FEATURED_NOW=2026-11-08T06:00:00Z node scripts/rotate-featured.mjs   pretend it's another date, to check the schedule
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { loadCardData } from "./build-helpers.mjs";

const FEATURED_PATH = "docs/featured.json";
const TIME_ZONE = "America/Los_Angeles";
// Ask for the next batch when this many weeks (or fewer) are left after the current one.
const WARN_WEEKS_LEFT = 2;

const featured = JSON.parse(await readFile(FEATURED_PATH, "utf8"));
const { cards } = await loadCardData();
const slugs = new Set(cards.map((card) => card.slug));

const week = weekStartInPacific(process.env.FEATURED_NOW ? new Date(process.env.FEATURED_NOW) : new Date());
const lines = [`## Featured sleeper`, ""];

if (week < featured.current.startsOn) {
  lines.push(`The current batch starts ${featured.current.startsOn}; still showing ${featured.showing}.`);
} else {
  let index = weeksBetween(featured.current.startsOn, week);
  if (index >= featured.current.cards.length && featured.upcoming?.cards?.length) {
    featured.current = { startsOn: week, cards: featured.upcoming.cards };
    featured.upcoming = null;
    index = 0;
    lines.push("Started the upcoming batch.");
  }
  const looping = index >= featured.current.cards.length;
  const position = index % featured.current.cards.length;
  const slug = featured.current.cards[position];
  if (!slugs.has(slug)) throw new Error(`${FEATURED_PATH}: ${slug} is not a published card.`);

  featured.showing = slug;
  if (featured.history.at(-1)?.week !== week) featured.history.push({ week, card: slug });
  lines.push(`Week of ${week}: ${slug} (card ${position + 1} of ${featured.current.cards.length}${looping ? ", looping" : ""}).`);

  const weeksLeft = looping ? 0 : featured.current.cards.length - 1 - position;
  if (!featured.upcoming && weeksLeft <= WARN_WEEKS_LEFT) {
    const lastWeek = addDays(featured.current.startsOn, 7 * (featured.current.cards.length - 1));
    lines.push(`Next batch needed: ${weeksLeft} week(s) left after this one (last week ${lastWeek}).`);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `needs_batch=true\nlast_week=${lastWeek}\n`);
  }
}

await writeFile(FEATURED_PATH, `${JSON.stringify(featured, null, 2)}\n`, "utf8");
const summary = lines.join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

// The Sunday (Pacific) that starts the week containing `date`, as YYYY-MM-DD. A run that GitHub starts late,
// after midnight Pacific, still lands in the same week.
function weekStartInPacific(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return addDays(`${parts.year}-${parts.month}-${parts.day}`, -dayIndex);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weeksBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / (7 * 86400000));
}
