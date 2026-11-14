# Reading-passage writer's brief (T3)

You write reading-comprehension passages for two Israeli girls aged 7–8 (grade 2, November) who take the Ministry's
gifted screening test (Stage A) on 30.11.2026. Read `content/SCHEMA.md` and follow it exactly. Write Hebrew **without
nikud**, in ktiv male. A pipeline adds nikud later. Overwrite the file ids you are assigned in `content/src/passages/`;
earlier drafts there were rejected and you must NOT reuse their text.

## What the real booklet looks like
- **Informational "הטללית" (17 lines, 5 questions):**
  - Starts with a hook: "when we hear the word 'predators' we think of lions or tigers, but in nature there are
    also predatory plants." Then a vivid description of the sundew: long leaves, many thin hairs, a drop of sweet
    sticky stuff at the tip of each hair that shines in the sun like dew drops. Then the action: insects flying in the
    air are drawn to the shining drops that look like nectar and smell sweet; they land on the leaves. "איזו הפתעה!"
    The drops are sticky, the insect sticks to the leaf, and the thin hairs bend and trap it. That is how the sundew
    feeds on it. Then a reassuring closing paragraph: don't worry, sundews are not dangerous to people, and many grow
    them at home to help get rid of flies and mosquitoes.
  - Real facts, a little wonder and a surprise, and a warm voice addressing the reader.
- **Story "הקסם של הלילה" (~25 lines, 7 questions):** a boy who wonders what happens at night. A sudden idea pops into
  his head ("צץ רעיון"). He stays awake and listens: the leaves rustle, it is very quiet. An owl, and a playful thought
  that the owl might sometimes want to swap day and night. He falls asleep smiling.

## Questions: use the booklet's own phrasings
- `detail` — "מדוע הטללית נקראת צמח טורף?"
- `reference` — "בשורה 2 כתוב שבטבע קיימים **גם** צמחים טורפים. מדוע כתוב 'גם'?" / "בשורה 23 כתוב: '…'. המילה 'גם' מתייחסת לינשוף וגם –" / what "הוא / זה / שם / אותם" refers to.
- `purpose` — "בשורה 16 כתוב ש… המטרה של המשפט הזה היא –" (the purpose of ONE sentence: to reassure, to explain, to give an example, to surprise…).
- `vocab` — "בשורה 7 כתוב: 'פתאום צץ רעיון בראשו'. מה פירוש המילה 'צץ'?" (options are single words, all real words, only one fits the context).
- `inference` / `why` — "מדוע יונתן הצליח לשמוע בלילה את רשרוש העלים?" (the answer is not a copied sentence; it needs one step of thought).
- "בשורה 11 כתוב: 'איזו הפתעה!' מהי ההפתעה?"
- `not-answered` — "על איזו שאלה מהשאלות שלפניכם **אין** תשובה בקטע המידע?" Every option must be a SPECIFIC question about this passage's topic; three are answered in the text and one is not.
- `synonyms` — the booklet defines it inside the stem: "מילים נרדפות הן מילים שיש להן אותה המשמעות או שהמשמעות שלהן דומה מאוד. באיזה צמד מילים, מהצמדים שלפניכם, המילים **אינן** מילים נרדפות?"
- Also allowed: `title`, `sequence`, an "emotion of a character" question.

## Quality bar (a draft is rejected for any of these)
- **No filler.** Never pad a line to reach a word count. Lines break at natural phrase boundaries, and line lengths vary
  naturally between 6 and 11 words. Paragraphs have different lengths.
- **Every question and every option is specific to THIS passage.** Never use generic templates such as "מה הנושא המרכזי",
  "איזה מידע נוסף נמסר" or "הקטע מוסר עובדות". Each `explain` names the actual fact or reasoning and the line, in 1–2
  kind sentences ("בשורה 12 כתוב שהטיפות דביקות, ולכן החרק נדבק לעלה.").
- **Exactly one correct answer** under every reasonable reading. Distractors use words that do appear in the passage
  but are wrong, or are tempting half-truths. They are never absurd ("לשכנע לקנות מוצר").
- **Pronoun and reference questions:** check the antecedent twice. Read the sentence before it.
- **Facts are TRUE.** Informational content must be correct, simple and not made up. If unsure of a number, leave the
  number out.
- **Stories are coherent.** Every character is introduced before acting. The story has a real problem, an attempt, a
  turn and a warm ending, plus a light touch of humor. Dialogue is welcome, with Hebrew quotation marks "…".
- **Grade-2 Hebrew that a native speaker would write:** short sentences, with 3–6 richer words per passage (those are what
  the vocab and synonym questions test). It must not sound translated.
- **Line references are exact:** lines are numbered across paragraphs starting at 1, the quoted words appear exactly in
  the cited line, and `lineRef` lists that line.
- **Answer positions:** within your 6 passages, spread the answers roughly evenly over 0–3. No rotation pattern; vary
  it naturally.

## Sizes
| Kind | Level 1 | Level 2 (official) | Level 3 |
|---|---|---|---|
| informational | 13–15 lines, 5 Qs | 16–19 lines, 5–6 Qs | 18–22 lines, 6 Qs |
| story | 16–19 lines, 6 Qs | 22–26 lines, 7 Qs | 24–28 lines, 7 Qs |

Every passage includes at least one line-cited `vocab`, one `reference`, one of `purpose`/`not-answered`, and one
`inference`/`why`. Stories also include a `synonyms` question. Each passage has a `title`, and an `imageCaption` of
null.

## Before you finish
1. Run `node tools/check-content/validate.mjs content/src/passages/<id>.json` for each of your files. Zero errors.
   Treat the warnings as errors unless the warning is wrong.
2. Re-read every passage aloud, as if you were a 7-year-old. Then answer every question WITHOUT looking at the key, and
   compare. Fix anything ambiguous.
3. Your final reply: one block per passage, with the full text and questions (answer marked), so the planner can review.
   Do not git-commit.
