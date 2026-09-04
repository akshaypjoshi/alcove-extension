/**
 * Lorem ipsum generator.
 *
 * Seeded rather than calling Math.random() directly: the output is derived
 * in a useMemo, so an unseeded generator would produce different text on
 * every unrelated re-render - the passage would reshuffle itself while you
 * were reading it. A seed makes the same settings give the same passage
 * until you actually ask for a new one.
 */

const WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
  "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
  "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
  "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "eu", "fugiat", "nulla", "pariatur", "excepteur",
  "sint", "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui",
  "officia", "deserunt", "mollit", "anim", "id", "est", "laborum", "perspiciatis",
  "unde", "omnis", "iste", "natus", "error", "voluptatem", "accusantium",
  "doloremque", "laudantium", "totam", "rem", "aperiam", "eaque", "ipsa", "quae",
  "ab", "illo", "inventore", "veritatis", "quasi", "architecto", "beatae", "vitae",
  "dicta", "explicabo", "aspernatur", "odit", "fugit", "consequuntur", "magni",
  "ratione", "sequi", "nesciunt", "neque", "porro", "quisquam", "dolorem",
];

const CLASSIC_OPENING = "Lorem ipsum dolor sit amet, consectetur adipiscing elit";

export type LoremUnit = "paragraphs" | "sentences" | "words" | "list";

export const LOREM_UNITS: { id: LoremUnit; label: string }[] = [
  { id: "paragraphs", label: "Paragraphs" },
  { id: "sentences", label: "Sentences" },
  { id: "words", label: "Words" },
  { id: "list", label: "List items" },
];

/** mulberry32 - small, fast, and good enough for prose. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(next: () => number, min: number, max: number) {
  return min + Math.floor(next() * (max - min + 1));
}

function words(next: () => number, count: number): string[] {
  return Array.from({ length: count }, () => WORDS[Math.floor(next() * WORDS.length)]);
}

function sentence(next: () => number): string {
  const parts = words(next, pick(next, 6, 15));
  // A comma somewhere in the middle of longer sentences, so the block
  // doesn't read as a flat list of clauses.
  if (parts.length > 9 && next() > 0.4) {
    const at = pick(next, 3, parts.length - 3);
    parts[at] = parts[at] + ",";
  }
  const text = parts.join(" ");
  return text[0].toUpperCase() + text.slice(1) + ".";
}

export interface LoremOptions {
  unit: LoremUnit;
  count: number;
  /** Begin with the canonical "Lorem ipsum dolor sit amet…" line. */
  classicOpening: boolean;
  /** Wrap output in <p> or <li> tags. */
  html: boolean;
  seed: number;
}

export function generateLorem({
  unit,
  count,
  classicOpening,
  html,
  seed,
}: LoremOptions): string {
  const next = rng(seed);
  const n = Math.max(1, Math.min(count, 100));

  if (unit === "words") {
    const list = words(next, n);
    if (classicOpening) {
      const opening = CLASSIC_OPENING.toLowerCase().replace(/,/g, "").split(" ");
      list.splice(0, Math.min(opening.length, list.length), ...opening.slice(0, n));
    }
    const text = list.join(" ");
    return html ? `<p>${text}</p>` : text;
  }

  const makeSentence = (first: boolean) =>
    first && classicOpening ? `${CLASSIC_OPENING}.` : sentence(next);

  if (unit === "sentences" || unit === "list") {
    const items = Array.from({ length: n }, (_, i) => makeSentence(i === 0));
    if (unit === "list") {
      return html
        ? `<ul>\n${items.map((i) => `  <li>${i}</li>`).join("\n")}\n</ul>`
        : items.map((i) => `• ${i}`).join("\n");
    }
    return html ? `<p>${items.join(" ")}</p>` : items.join(" ");
  }

  let first = true;
  const paragraphs = Array.from({ length: n }, () => {
    const body = Array.from({ length: pick(next, 3, 6) }, () => {
      const s = makeSentence(first);
      first = false;
      return s;
    }).join(" ");
    return html ? `<p>${body}</p>` : body;
  });

  return paragraphs.join(html ? "\n" : "\n\n");
}

export function countWords(text: string): number {
  const stripped = text.replace(/<[^>]+>/g, " ").trim();
  return stripped ? stripped.split(/\s+/).length : 0;
}
