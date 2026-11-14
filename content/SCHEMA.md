# Content schema (shared contract — app, nikud pipeline, content writers)

Folder layout (one owner per folder):

```
content/src/            ← SOURCE, Hebrew WITHOUT nikud (writers own these)
  passages/<id>.json
  word-problems.json
  picture-riddles.json
  bonus/analogies.json, bonus/series.json, bonus/sentences.json, bonus/odd-one-out.json
  ui.json               ← every UI / instruction / feedback / companion line
content/nikud/          ← pipeline cache, diffs, adjudications (pipeline owns)
content/build/          ← OUTPUT: same files, every Hebrew string vocalized (pipeline writes; app reads)
tools/nikud/            ← pipeline code
app/                    ← the PWA; copies content/build → app/public/content at build time
```

## Text rules (all files)
- Source Hebrew is **ktiv male, no nikud at all** (no points or cantillation in U+0591–U+05C7, EXCEPT the punctuation
  maqaf U+05BE, paseq U+05C0, sof pasuq U+05C3 and nun hafukha U+05C6, which are allowed; maqaf is required, see below).
  The pipeline adds nikud. Never hand-vocalize in `src/`.
- Exception: a word whose reading is ambiguous even in context may carry a hint: `{{word|vocalized}}`
  e.g. `{{ספר|סֵפֶר}}`. The pipeline uses the hint as a 4th vote (it still checks it).
- Numbers stay as digits. Use the real maqaf (U+05BE) after one-letter prefixes before digits: `בְּ־8` is written `ב־8` in src.
- Kid-facing register: grade 2, short sentences, warm, no slang. Addressing the child: plural like the official
  booklet ("קראו", "הקיפו", "ענו") in instructions; companion lines are gender-neutral or plural.
- Every string field that holds Hebrew is listed below; anything else (ids, numbers, enums) is never vocalized.

## passages/<id>.json
```json
{
  "id": "inf-01",                    // inf-NN = informational, story-NN = story
  "kind": "informational",           // "informational" | "story"
  "title": "הטללית",
  "level": 2,                        // 1 easier … 3 = official difficulty or above
  "paragraphs": [                     // FIXED line breaks: line numbers are cited by questions
    ["line 1 text …", "line 2 text …"],
    ["line 3 …"]
  ],
  "image": null,                      // optional filename in app/public/img/passages/, or null
  "imageCaption": null,               // Hebrew, optional
  "questions": [
    {
      "id": "inf-01-q1",
      "type": "detail",               // detail | vocab | reference | purpose | not-answered | synonyms | inference | why | title | sequence
      "lineRef": [5, 6],              // optional: lines cited in the stem
      "stem": "מדוע הטללית נקראת צמח טורף?",
      "options": ["…", "…", "…", "…"],// exactly 4, in display order א ב ג ד
      "answer": 1,                    // 0-based index
      "explain": "…"                  // 1–2 short kid sentences shown after a wrong answer; may cite the line
    }
  ]
}
```
Line length: 7–11 words per line (the official booklet is ~10). Passage length: 14–26 lines. 5–7 questions.

## word-problems.json
```json
[{
  "id": "wp-001", "level": 2,
  "topic": "legs",                    // free tag: legs | money | time | groups | rounds | leftovers | compare | …
  "stem": "…",
  "options": ["ב־8", "ב־10", "ב־12", "ב־14"],
  "answer": 2,
  "check": "4*4 - 5*2... (JS expression that evaluates to the numeric value of the right option)",
  "checkValue": 12,                   // must equal eval(check) and the number in options[answer]
  "explain": "…",
  "hint": "…"                          // shown before the 2nd try
}]
```
Distractors are typical mistakes (wrong operation, forgot a step, counted only one group), never random.

## picture-riddles.json
Icons are ids from the app's icon set (flower, star, gem, key, house, car, sun, apple, heart, moon, ball, fish).
```json
[{ "id": "pr-01", "level": 1,
   "rows": [ {"terms": ["flower","flower"], "total": 6},
             {"terms": ["flower","flower","star"], "total": 14} ],
   "ask": "star", "options": [3,4,6,8], "answer": 3 }]
```
No Hebrew in this file (the instruction lives in ui.json). Solution must be unique; validate by brute force 0–30.

## bonus/*.json
Same shape as a passage question (`id, type, stem, options[4], answer, explain`) plus `"level"`.

## ui.json
Flat object `{ "key": "Hebrew text" }`. Keys are dotted: `home.title`, `reading.instructions`, `math.a.title`,
`feedback.correct.1` … The app never hard-codes Hebrew; it reads ui.json (build version).

## Build output
`content/build/**` mirrors `content/src/**` exactly, same keys and order, with every Hebrew string replaced by its
vocalized form (NFC-normalized, marks in canonical order). The app treats build files as read-only data.
