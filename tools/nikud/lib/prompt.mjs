// The ONE instruction text every LLM vocalizer receives (Codex/GPT and Claude get the identical prompt).
// Bump PROMPT_VERSION whenever the wording changes: it is part of the cache key, so cached outputs from an older
// prompt are not mixed with new ones.
export const PROMPT_VERSION = 'v1-2026-11-14';

export const STYLE_RULES = `You are an expert Hebrew vocalizer (מנקד/ת) preparing reading material for 7-year-old children, in the style of the
Israeli Ministry of Education test booklets: FULL nikud on EVERY word, spelling kept in כתיב מלא.

ABSOLUTE RULES (a violation makes the whole answer unusable):
1. Never add, remove, change or reorder letters. Keep the spelling exactly as given, in כתיב מלא: every י and ו stays,
   even where ktiv haser would drop it (מידע → מֵידָע, צריכים → צְרִיכִים, מאוד → מְאוֹד, סיפור → סִיפּוּר).
   A mater lectionis (a silent י / ו / א / ה that only marks a vowel) gets no vowel sign of its own.
2. Never add, remove or change punctuation, digits, spaces, maqaf (־), quotes or any other character.
   Only insert nikud marks into the Hebrew letters.
3. Return exactly the same units, with the same ids, in the same order, each with exactly the same number of items,
   item i being the vocalized copy of input item i.

STYLE:
- Every pronounced letter gets its vowel; a letter that closes a syllable inside a word gets a sheva (silent or
  vocal). The last letter of a word gets no sheva, except final kaf and the words that end in two consonants (אַתְּ).
- Shin dot or sin dot on EVERY ש (שָׁלוֹם, שָׂמֵחַ, יִשְׂרָאֵל).
- Dagesh kal in ב ג ד כ פ ת at the start of a word and after a closed syllable (בַּיִת, גָּדוֹל, מִסְפָּר).
- Dagesh chazak wherever due, including after the definite article and after מִ/שֶׁ prefixes (הַיֶּלֶד, הַשֶּׁמֶשׁ, שֶׁכְּבָר).
  Gutturals (א ה ח ע ר) never take dagesh; the vowel before them changes instead (הָאִישׁ, הֶחָבֵר).
- Kamatz katan where the sound is "o": write it with the ordinary kamatz sign ָ (U+05B8), exactly as the booklet
  prints it (כָּל, חָכְמָה, תָּכְנִית). Never use U+05C7.
- Patach gnuva under a word-final ח or ע (or הּ) that follows a vowel other than "a" (רֵיחַ, לוּחַ, שָׂמֵחַ, יָדוּעַ, גָּבוֹהַּ).
- Hataf vowels where due, mainly under gutturals (אֲנִי, חֲבֵרִים, אֱמֶת, עֳנִי).
- Final kaf: ךְ with sheva (שֶׁלָּךְ, מֶלֶךְ, הָלַךְ) or ךָ with kamatz (לְךָ, אוֹתְךָ, שֶׁלְּךָ), as the grammar of the word requires.
- Holam male is וֹ, shuruk is וּ; a consonantal ו/י written double in ktiv male keeps both letters.
- One-letter prefixes before a digit keep their vowel, before the maqaf: ב־8 → בְּ־8, ל־5 → לְ־5.
- No meteg, no cantillation marks, no other marks.
- The items inside one unit are consecutive pieces of the same text (lines of one passage, or a question with its
  answer options and explanation). Read the whole unit before vocalizing, and use that context to choose between
  readings of ambiguous words (for example ספר can be סֵפֶר, סָפַר, סַפָּר or סְפָר).
- Use standard modern Israeli Hebrew vocalization (Academy of the Hebrew Language rules) for a children's text.`;

export function buildPrompt(units) {
  const payload = { units: units.map((u) => ({ id: u.key, items: u.items.map((it) => it.text) })) };
  return `${STYLE_RULES}

OUTPUT FORMAT: print ONLY one JSON object, no explanation, no markdown, no code fences:
{"units":[{"id":"<same id>","items":["<vocalized item 1>","<vocalized item 2>", ...]}, ...]}
Do not read or write any files and do not run any commands; everything you need is below.

INPUT:
${JSON.stringify(payload, null, 1)}
`;
}

/** Robustly pull the {"units":[...]} object out of a model's reply. Returns Map(id → items[]). */
export function parseUnitsReply(text) {
  const candidates = [];
  const t = String(text || '').trim();
  candidates.push(t);
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(t.slice(a, b + 1));
  for (const c of candidates) {
    let obj;
    try { obj = JSON.parse(c); } catch { continue; }
    const list = Array.isArray(obj) ? obj : obj && Array.isArray(obj.units) ? obj.units : null;
    if (!list) continue;
    const map = new Map();
    for (const u of list) if (u && typeof u.id === 'string' && Array.isArray(u.items)) map.set(u.id, u.items.map(String));
    return map;
  }
  throw new Error(`could not parse a {"units":[...]} JSON object from the reply (first 200 chars: ${t.slice(0, 200)})`);
}

/** Pack units into batches of at most maxChars source characters (a unit is never split). */
export function batchUnits(units, maxChars) {
  const batches = [];
  let cur = [];
  let size = 0;
  for (const u of units) {
    const len = u.items.reduce((n, it) => n + it.text.length, 0);
    if (cur.length && size + len > maxChars) { batches.push(cur); cur = []; size = 0; }
    cur.push(u);
    size += len;
  }
  if (cur.length) batches.push(cur);
  return batches;
}
