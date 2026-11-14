# Nikud pipeline (T2)

Turns `content/src/**` (Hebrew in ktiv male, **no nikud**) into `content/build/**` (same files, same keys, every
Hebrew string fully vocalized, NFC). Three independent vocalizers, a word-by-word vote, an adjudication file, a
mechanical lint, and a review page for LiaD.

```
node tools/nikud/run.mjs [--only <glob>] [--vocalizers dicta,codex,claude] [--dry]
                         [--src DIR] [--build DIR] [--work DIR] [--decisions FILE]
                         [--refresh dicta,codex] [--claude-mode auto|cli|handoff] [--font "Family"] [--seed S]
node --test tools/nikud/test/          # unit tests (no network)
```

Run it from a shell **without the Claude Code sandbox** (the Codex companion's app-server cannot start inside it;
the run fails with `codex app-server connection closed`).

| Exit | Meaning |
|---|---|
| 0 | build written to `content/build` |
| 1 | build blocked: unresolved disagreements, lint errors, bad decisions, or bad source (nikud in src, bad hint) |
| 2 | a vocalizer is incomplete (error, pending Claude handoff, or `--dry` with uncached units) |

## Stages

1. **Extract** (`lib/extract.mjs`). Every string containing a Hebrew letter, in every `.json` under src, except
   values of `id/type/kind/topic/image/check/ask/icon/key`. Strings are grouped into **units** that the vocalizers
   see together: a passage's title + all lines + caption (lines of one paragraph are joined with a space for Dicta, so
   a sentence broken across lines stays one sentence); each question (stem, options, explain); each word problem /
   bonus item; each `ui.json` string. `{{word|hint}}` is stripped to `word` for the vocalizers and kept as a 4th vote.
   Nikud already present in src (outside a hint) is an error.
2. **Vocalize** (`lib/vocalize.mjs`, `lib/adapters/*`). The three adapters run in parallel; each caches per unit in
   `<work>/cache/<vocalizer>/<sha(salt|PROMPT_VERSION|unit text)>.json`, so a re-run only sends changed units.
   `--refresh codex` ignores one vocalizer's cache. The LLM prompt is `lib/prompt.mjs` (identical for GPT and Claude);
   bump `PROMPT_VERSION` when it changes.
3. **Compare** (`lib/compare.mjs`). Each output is normalized (below), its consonant skeleton (letters, punctuation,
   digits, maqaf — every mark U+0591–U+05C7 removed; maqaf/paseq/sof-pasuq/nun-hafukha are kept because they are not
   marks) must equal the source; an LLM unit that fails is retried once, then kept and recorded in
   `skeleton-errors.json`. Words are aligned to the source by skeleton (LCS), so one dropped letter costs that
   vocalizer only the affected word's vote. A word is **accepted** when all selected vocalizers (and the hint, if any)
   give the identical form. Anything else goes to `disagreements.json`.
4. **Decisions** (`<work>/decisions.json`, filled by the planner's Opus adjudication pass):
   ```json
   { "w-140fbfb44722": { "form": "בַּבּוֹקֶר", "reason": "…the grammar rule…", "lintAllow": ["bare-yod"] } }
   ```
   The id is `w-` + sha256(skeleton word ␟ skeleton of the whole source string ␟ occurrence-in-string)[0:12]: stable
   across runs and vocalizer changes, and it changes when the sentence changes. A decision whose letters differ from the
   word is rejected. A decision may also override an agreed word (e.g. to fix a lint error) and may whitelist lint
   rules for that word with `lintAllow`. **Any unresolved id blocks the build.**
5. **Build + lint** (`lib/lint.mjs`). The output is rebuilt from the source tokens with the chosen forms (so
   punctuation and spacing are the writers' own), staged, linted, and only then swapped into `content/build`
   (`--only` merges into the existing build). Lint errors block the build; warnings are listed in `lint-report.json`.
6. **Review page** `<work>/review.html`: every disagreement in its sentence with the three versions, the hint, the
   decision and its reason, plus a seeded-random 10% of passages in full (with questions). Checkbox + "problem" flag +
   note per item in localStorage, and a JSON export of the flagged items. Font: `--font` (default Noto Sans Hebrew via
   Google Fonts; switch to the app font once T1 picks it).

Other outputs in `<work>`: `last-run.json` (stats, agreement, per-vocalizer accuracy against the final form, timing
and cost), `lint-report.json`, `skeleton-errors.json`, `handoff/` (Claude handoff prompts and replies).

## Normalization (applied to every vocalizer, hint and decision)

- NFC (canonical mark order).
- Qamats qatan U+05C7 → plain qamats U+05B8 (the booklet prints כָּל); holam haser for vav U+05BA → U+05B9.
- Cantillation, meteg, rafe, upper/lower dots and bidi controls are dropped.
- **Dicta's ktiv-maleh convention** puts holam male on the letter *before* a bare ו (`בַּבֹּוקֶר`, `לִפְתֹּור`) and the
  same for qubuts (`בֻוקֵּר`). The booklet prints `בַּבּוֹקֶר`, `וּ`. `maleVowelsOnVav()` moves the mark onto a bare
  following ו; a ו that carries any mark is a consonant and is left alone.
- **Doubled consonantal וו / יי**: the official booklet (`gifted-students-heb-2025.pdf` p.2: `קַיָּימִים`,
  `בָּאֲוִויר`) puts the vowel and dagesh on the FIRST letter and leaves the second bare. Dicta does the same; Claude
  marks the second (`כַּווֶּרֶת`). `doubledVowelOnFirst()` moves the marks to the first letter, except when the second
  ו is holam male / shuruk (`מִצְווֹת`).

## Ktiv-haser repair (LLM outputs)

GPT habitually writes ktiv-male words in ktiv haser (`חֹרֶף` for `חורף`, `שַׁיָּךְ` for `שייך`) even when told not to:
in the 325-word sample it changed letters in 24 of 53 strings. Such a word still aligns (`isMaterDeletion`), and
`restoreMatres()` puts the source's matres back without touching the vowels the model chose (a missing ו takes the
preceding holam → `וֹ` or qubuts → `וּ`, or is the bare second ו of a doubled vav; a missing י is bare after
hiriq/tsere/segol or another י). The restored form still has to equal the other two votes to count. Units whose only
letter changes are restorable are **not** retried; anything else (a changed/missing letter, punctuation, item count)
is retried once, and a word that is still wrong loses that vocalizer's vote. Everything is logged in
`skeleton-errors.json` (`matresRestored`, `wordsLost`).

## Vocalizers

### (a) Dicta Nakdan
- **Endpoint:** `POST https://nakdan-u2-1a.loadbalancer.dicta.org.il/api` (override: `NIKUD_DICTA_ENDPOINT`). Found in the
  current bundle of `https://nakdan.dicta.org.il/` (`/assets/index-*.js`, constant `aS`) on 2026-11-14; the Nakdan Pro
  bundle uses the same host. Older hosts in open-source code: `nakdan-2-0`, `nakdan-u1-0`, `nakdan-5-1` (same API).
- **Body** (exactly what the web UI sends, ktiv maleh + modern):
  `{"task":"nakdan","data":"<text>","genre":"modern","keepqq":true,"addmorph":true,"keepmetagim":true,"nodageshdefmem":false,"patachma":false,"useTokenization":true}`.
  `keepqq:true` is the UI's "ניקוד בכתיב מלא" switch. Reply: `{"data":[{"str","sep","nakdan":{"options":[{"w":"הַ|יַּלְדָּה",…}],"fconfident"}}]}`;
  `|` marks the prefix boundary and is stripped. The top option is the vote; the top 5 options and `fconfident` are
  kept in `disagreements.json` for the adjudicator.
- **Use:** only our own generated text is sent. One request at a time, ≥1.5 s apart, ≤2,000 characters each (the UI
  caps at 5,000), and the first error stops the adapter (no retries). No auth, no key.
- **Terms note:** there is no published API contract or developer page. Dicta's Nakdan paper (ACL 2020 demos) says the
  system is released "for free unrestricted use". The site's generic Terms of Service (`/terms-and-services`, "Last
  modified 27 November 201x") include the boilerplate clause: do not misuse the services or "try to access them using
  a method other than the interface and the instructions that we provide". The endpoint is the one the public UI
  calls and is widely used by open-source projects (Sefaria, Otzaria, Home-Assistant nakdan, nakdimon research). For
  the full run (~25 requests) this is low volume; if LiaD wants certainty, email Dicta (dicta.org.il → Contact) for
  permission.
- Known systematic behaviour: leaves a one-letter prefix before a digit bare (`ב־2`), prefers `מֶה` before some
  letters, and sometimes picks the indefinite reading (`בְּשׁוּרָה`). These surface as disagreements.

### (b) GPT via Codex
`node ~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs task --model gpt-6-luna --effort high --json --prompt-file <tmp>`
from the project root, read-only (no `--write`). `--model gpt-6-luna` is required: the default model is rejected for
this account while the exit code is still 0, so an empty `rawOutput` is treated as an error. Batches ≤3,500 source
characters. A start-up `app-server connection closed` (seconds, no cost) is retried twice, 20 s apart.
Env overrides: `NIKUD_CODEX_MODEL`, `NIKUD_CODEX_EFFORT`, `NIKUD_CODEX_COMPANION`.

### (c) Claude Opus
- `--claude-mode cli`: `~/.local/bin/claude -p --model opus --tools "" --output-format json --no-session-persistence`
  with the prompt on stdin; cost comes from `total_cost_usd`. The child env drops `CLAUDECODE` / `CLAUDE_CODE_*`
  (the desktop app's `CLAUDE_CODE_SIMPLE` skips keychain auth). **Needs a logged-in CLI**: run `claude` once in
  Terminal.app and `/login`. On 2026-11-14 it answered "OAuth session expired and could not be refreshed".
- `--claude-mode handoff`: each batch prompt is written to `<work>/handoff/claude/<id>.prompt.md`; whoever answers it
  (an Opus session/subagent told to follow the file and nothing else) writes the raw reply to `<id>.response.txt`
  (optional `<id>.response.txt.meta.json` = `{"ms":…}` for timing). Re-run the pipeline to pick the replies up.
- `auto` (default): CLI first; on an auth error, handoff for the rest of the run.

## Lint rules (`lib/lint.mjs`, tests in `test/lint.test.mjs`)

Errors: `stray-mark`, `forbidden-mark`, `double-mark`, `dot-on-non-shin`, `shin-dot` (every ש), `final-form`,
`final-kaf` (ךְ / ךָ), `unvocalized-word`, `bare-letter` (mid-word letter with no vowel/sheva that is not a silent
א/ו/י/ה), `bare-initial`, `patach-gnuva` (final ח/ע/הּ after i/e/o/u), `begadkefat-initial` after a pause (start of
string or after punctuation; mid-sentence it is a warning), `double-holam`, `article-dagesh` (הַ + non-guttural
letter with its own full vowel and no dagesh), `skeleton`.
Warnings: `bare-vav` / `bare-yod` / `bare-he` (suspicious matres — ktiv male's doubled וו/יי, yod after i/e are
allowed), `vav-holam-after-vowel`, `shuruk-after-vowel`, `article-dagesh` when the vowel only comes from a following
וֹ/וּ (הַמוֹן is a real word), `hataf-non-guttural`, `initial-guttural-sheva`, `final-sheva`, `dagesh-guttural`.

## Measured on 2026-11-14 (for budgeting)

| Sample | Words | Agreement (3/3) | Disagreement ids | Dicta | GPT (Codex) | Claude (Opus, handoff subagent) |
|---|---|---|---|---|---|---|
| trap sentences + ui | 64 | 85.9% | 9 | 1.1 s (1 request) | 61 s first pass | 34 s |
| 2 passages + 4 questions | 325 | 93.8% | 20 | 2.4 s (1 request) | 251 s incl. a full retry (now skipped when restorable) | 95 s |

Accuracy against the final (decided) form on the trap set: Claude 64/64, Dicta 61/64 (`מֶה`, `בְּשׁוּרָה`, bare
`ב־2`), GPT 58/64 (missing dagesh in `הַיַּלְדָּה` ×3, `לְבֵן`, `עִיתוֹן`, `שְׁלָבִים`). On the 325-word sample, the times each vocalizer
was the lone dissenter: Dicta on 10 words, GPT on 8, Claude on 0.
