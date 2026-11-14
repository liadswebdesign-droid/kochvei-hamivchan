# Smart Girls: gifted-test practice app (plan)

**Goal:** a fun, installable app for the Galaxy Tab A11+ that gets both girls (grade 2) comfortable with every part of the
Ministry's Stage A screening test (מבחן סינון כיתה ב, שלב א) before the end of November 2026, with a large bank of
new questions and reading passages whose nikud is verified three ways.

**Decided with LiaD on 2026-11-14:** it is an installable web app (PWA) on GitHub Pages, both girls are on the grade-2
track, each girl picks her own companion at first launch, and progress stays on the tablet behind a parent PIN
screen. There is no server.

---

## 1. What the real test looks like (from the official 2025 test and its key in this folder)

| Part | Task | Items | Format |
|---|---|---|---|
| Part 1: reading passages and questions | 2 passages, one informational ("הטללית") and one story ("הקסם של הלילה"), ~17–25 numbered lines, full nikud | 5 + 7 | Circle א–ד |
| — "עצרו!" page, wait for the proctor — | | | |
| Part 2, task A: exercises | +, −, × within 100 | 3 | Write the number |
| Part 2, task B: the missing number | `47 + __ = 62`, `6 × __ = 36`, plus inequalities (`47+15 < 47+__`) | 5 | Write the number (inequalities accept any valid number) |
| Part 2, task C: word problems | multi-step: legs, cards over rounds, eggs in cartons | 3 | Circle א–ד |
| Part 2, task D: picture riddles | Equations with pictures (🌸+🌸=6, 🌸+🌸+⭐=14) | 3 | Circle א–ד |

**Reading question types seen:** a detail fact, why something is called X, what a function word does ("why does it say *also*", "who else does *also* point to"), what an exclamation refers to, the purpose of a sentence, which question the passage does **not** answer, the meaning of a word in context, why a character did something, and synonyms ("which pair is **not** synonyms"). Lines are numbered and questions cite line numbers.

**Scoring:** one point per item. Mirror-written digits are accepted. Reversed digits (61 for 16) and two marked answers
score zero. This becomes a "one clear answer" habit the app teaches.

**Test date (Ministry parents portal):** **Monday 30.11.2026, 4th lesson**, so it runs one class period (≈45 min including the
teacher's worked examples). There are 26 items. Results come 22–30.12.2026.

**Other official Stage A samples** (in `web-samples/`):
- 2021/2024: 1 passage, 3 exercises, 2 word problems, and **"תרגילי משולשים"**: a △ stands for a missing digit
  (`1△ + 1△ = 28`, answers א–ד). This goes into the picture-riddles island as a second item type.
- Szold 2017: 3 passages, with money word problems answered in writing.

**Not in any official Stage A booklet:** number series, analogies, sentence completion, shapes. These are Stage B material,
so they stay as a small optional bonus island. Stage B is spring 2027, only for those who pass, and the official Stage B demo
is saved for later.

---

## 2. The app

- **Stack:** Vite + Preact, Hebrew RTL, plain CSS, and a service worker so it works offline. Fonts are self-hosted
  (the choice is settled by a nikud-rendering test, see T1). It deploys from GitHub Actions to GitHub Pages under
  `liadswebdesign-droid`. The repo is public, so it never contains the girls' names; those are typed on the tablet and
  stay there. Official Ministry test text is not copied into the app; only our own content goes in.
- **Target screen:** Galaxy Tab A11+ (11", 1920×1200, about 1280×800 CSS px), landscape and portrait, touch-only,
  with big tap targets and an on-screen number pad. No keyboard is needed.
- **First launch:** the girl enters her name and picks a companion from about 6 illustrated characters (animals,
  space, unicorn and so on). The companion cheers her on, gives hints and appears in celebrations.
- **World map:** one island per test skill: reading, exercises, missing number, word problems, picture riddles, plus a
  bonus island. Islands unlock gradually, and each has levels with 1–3 stars.
- **Practice mode:** feedback after every answer. A wrong answer gets a short, kind explanation that shows *why*, plus
  a hint before the second try. Mistakes come back later through light spaced repetition.
- **Mini-games:** a speed drill for arithmetic facts, a "catch the right number" game for missing numbers, a "detective"
  game for finding the line in the passage, and a picture-riddle builder.
- **Test simulation:** looks like the real booklet: the same instruction wording, circle-the-answer, line-numbered
  passages, the "עצרו!" break page, no feedback until the end, and an optional gentle timer. A results page follows.
  There are at least 6 full simulations.
- **Rewards:** stars, a sticker album, daily streak, confetti and sounds. All of it is calm and friendly, with nothing stressful.
- **Parent screen (PIN):** accuracy per skill and per girl, time spent, the list of mistakes, and simulation results.

## 3. Content volume

| Bank | How much | How it is made |
|---|---|---|
| Reading passages | **24** (12 informational, 12 stories), 5–7 Qs each, ≈150 Qs | Codex drafts, Claude·opus edits for grade-2 level and checks the answers, then the nikud pipeline |
| Word problems | **120** | Codex and Claude draft; a script recomputes every answer; distractors are built from typical mistakes |
| Exercises / missing number / inequalities | Unlimited | Generator with level control, answers computed |
| Picture riddles | 60 hand-designed + generator | Icons as SVG/emoji, solutions computed |
| Bonus (series, analogies, sentence completion, shapes) | ≈100 | Codex drafts, Claude checks, nikud pipeline |
| Instructions, feedback, explanations, UI text | everything a girl sees | All of it vocalized and run through the pipeline |

## 4. Nikud: checked three ways, with LiaD reading the last pass

Every string a girl sees is stored **with full nikud in כתיב מלא**, matching the official booklet's style (`מֵידָע`, `כָּל`,
`רֵיחַ`).

1. **Write without nikud first.** No model writes nikud while it composes.
2. **Three independent vocalizations:** (a) Dicta Nakdan, the best automatic Hebrew vocalizer (generated text only,
   no personal data); (b) GPT via Codex; (c) Claude·opus.
3. **Word-by-word three-way diff** after Unicode normalization. If all three agree, the word is accepted. Any
   disagreement goes to an Opus adjudication that gives reasons, citing the grammar rule.
4. **Mechanical lint:** shin/sin dot present, no letter missing a vowel where one is needed, final forms correct,
   patach gnuva, dagesh after the article, hataf vowels, and so on.
5. **LiaD's review page:** a single page listing every adjudicated word in context with the three versions side by
   side, plus a random 10% sample of full passages. Nothing ships until LiaD signs off.

## 5. Tasks (executor marked; LiaD can override)

| # | Task | Executor | Depends on |
|---|---|---|---|
| T1 | App skeleton: PWA, RTL, font test, profiles and companion pick, map, question engine (MC, number pad, inequalities, passage view with line numbers), practice mode, storage, offline, GitHub Pages deploy | Claude·opus | — |
| T2 | Content schema and **nikud pipeline** tooling (Dicta call, 3-way diff, lint, review-page generator) | Claude·opus | — (parallel with T1) |
| T3 | Reading bank: 24 passages + ≈150 Qs, written without nikud | Codex (drafts) → Claude·opus (edit and verify) | T2 schema |
| T4 | Math banks: 120 word problems, generators, 60 picture riddles, bonus world | Claude·sonnet + Codex drafts | T2 schema |
| T5 | Companions and sticker art (≈6 characters, ≈30 stickers), sounds, celebrations, mini-games | Codex images (one job at a time) + Claude·sonnet | T1 |
| T6 | Test-simulation mode (booklet look, עצרו page, results) + parent PIN screen | Claude·sonnet | T1, T3, T4 |
| T7 | Run the nikud pipeline over all content, adjudicate, build LiaD's review page, apply fixes | Claude·opus + Codex | T2–T4 |
| T8 | Tablet-viewport QA, Codex code review, deploy, install guide for LiaD (one-pager in Hebrew) | Claude·sonnet + Codex | all |

**Schedule (test by ~30 Nov):** T1, T2 and T3 start together → T4 and T5 → T6 and T7 → T8. The aim is a playable
first version (reading + math practice) in the girls' hands within about 4 days, then content keeps flowing in through
auto-updates.

## 6. Open items for LiaD
- Final read of the nikud review page (T7).
- Exact test date, if the school has announced it (it sets the simulation-timer default and the countdown on the map).
