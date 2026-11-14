# UI text keys

Every Hebrew string the app shows comes from `ui.json` through these keys. The values below are **unvocalized
placeholders** (from `app/dev-fixtures/ui.json`); the content team writes the final text into `content/src/ui.json`
and the nikud pipeline vocalizes it into `content/build/ui.json`.

- `{name}`, `{n}`, `{total}`, `{bound}`, `{example}`, `{a}`, `{b}`, `{c}`, `{lines}` are filled in by the app. Keep them
  exactly as written (Latin, curly braces). A number placeholder after a one-letter prefix takes the real maqaf: `מ־{bound}`.
- Addressing the child: plural in instructions ("קראו", "פתרו"), gender-neutral or plural in companion lines.
- `npm run build` fails if `content/build/ui.json` lacks any key in this list (scripts/content.mjs).
- Total: 148 keys. Regenerate this file with `npm run ui-keys`.

## App

| Key | Placeholder (unvocalized) |
|---|---|
| `app.previewBanner` | תצוגה מקדימה: תוכן לבדיקה בלבד |
| `app.loadError` | אופס, משהו לא נטען. נסו לסגור ולפתוח שוב |

## Shared buttons

| Key | Placeholder (unvocalized) |
|---|---|
| `common.continue` | המשך |
| `common.check` | בדיקה |
| `common.back` | חזרה |
| `common.cancel` | ביטול |

## Profiles

| Key | Placeholder (unvocalized) |
|---|---|
| `profile.welcome` | שלום! בואו נכיר |
| `profile.nameLabel` | איך קוראים לך? |
| `profile.namePlaceholder` | השם שלי |
| `profile.next` | הלאה |
| `profile.pickCompanionNamed` | {name}, מי יצטרף למסע? |
| `profile.start` | יוצאים לדרך! |
| `profile.whoPlays` | מי משחק עכשיו? |
| `profile.add` | פרופיל חדש |
| `profile.switch` | החלפת פרופיל |

## Companion names (one per entry in src/config.js)

| Key | Placeholder (unvocalized) |
|---|---|
| `companion.fox` | שועלי |
| `companion.bunny` | ארנבי |
| `companion.unicorn` | קשתית |
| `companion.owl` | ינשופי |
| `companion.panda` | פנדי |
| `companion.kitten-astronaut` | מיצי החללית |
| `companion.baby-dragon` | דרקוני |
| `companion.dolphin` | דולפי |

## World map

| Key | Placeholder (unvocalized) |
|---|---|
| `map.hello` | היי {name}! |
| `map.stars` | {n} כוכבים |
| `map.countdown` | עוד {n} ימים למבחן |
| `map.countdown.one` | המבחן מחר! |
| `map.countdown.today` | היום המבחן. בהצלחה! |
| `map.locked` | בקרוב |
| `map.level` | שלב {n} |
| `map.review` | {n} לחזרה |
| `map.album` | אלבום |
| `map.games` | משחקים |
| `map.streak` | {n} ימים ברצף |

## Island names

| Key | Placeholder (unvocalized) |
|---|---|
| `island.reading` | קריאה |
| `island.exercises` | תרגילים |
| `island.missing` | המספר החסר |
| `island.wordProblems` | בעיות מילוליות |
| `island.riddles` | חידות בציורים |
| `island.bonus` | אי הבונוס |
| `island.mock` | מבחן דמה |

## Instructions

| Key | Placeholder (unvocalized) |
|---|---|
| `instr.reading` | קראו את הקטע וענו על השאלות |
| `instr.exercises` | פתרו את התרגיל |
| `instr.missing` | השלימו את המספר החסר |
| `instr.inequality` | כתבו מספר שמתאים, כך שהתרגיל יהיה נכון |
| `instr.wordProblems` | קראו את השאלה והקיפו את התשובה הנכונה |
| `instr.riddles` | בתרגילים שלפניכם החליפו חלק מהמספרים בציורים. כל ציור מתאים למספר מסוים. ציורים זהים מתאימים למספרים זהים |
| `instr.riddles.ask` | איזה מספר מסתתר מאחורי |
| `instr.digit` | בתרגילים שלפניכם החליפו ספרה אחת בצורה. כל צורה מתאימה לספרה מסוימת. צורות זהות מתאימות לספרות זהות |
| `instr.digit.ask.triangle` | איזו ספרה מסתתרת במשולש? |
| `instr.digit.ask.square` | איזו ספרה מסתתרת בריבוע? |
| `instr.digit.ask.circle` | איזו ספרה מסתתרת בעיגול? |
| `instr.bonus.analogy` | בחרו את המילה שמשלימה את הזוג |
| `instr.bonus.sentence` | השלימו את המשפט |
| `instr.bonus.series` | מצאו את המספר הבא בסדרה |
| `instr.bonus.odd-one-out` | איזו מילה לא שייכת? |

## Answer labels

| Key | Placeholder (unvocalized) |
|---|---|
| `mc.label.1` | א |
| `mc.label.2` | ב |
| `mc.label.3` | ג |
| `mc.label.4` | ד |

## Number pad (screen-reader labels)

| Key | Placeholder (unvocalized) |
|---|---|
| `numpad.label` | לוח מספרים |
| `numpad.backspace` | מחיקת ספרה |

## Practice screen

| Key | Placeholder (unvocalized) |
|---|---|
| `practice.progress` | שאלה {n} מתוך {total} |
| `practice.quit` | יציאה למפה |
| `practice.review` | שאלה לחזרה |
| `practice.toPassage` | לקטע |
| `practice.toQuestion` | לשאלה |
| `practice.lines` | שורות {lines} |
| `practice.line` | שורה {lines} |

## Feedback after an answer

| Key | Placeholder (unvocalized) |
|---|---|
| `feedback.correct.1` | כל הכבוד! |
| `feedback.correct.2` | יפה מאוד! |
| `feedback.correct.3` | מעולה! |
| `feedback.correct.4` | בדיוק! |
| `feedback.secondTry` | הצלחתם בניסיון השני! |
| `feedback.star` | עוד כוכב לאוסף |
| `feedback.tryAgain` | כמעט! נסו שוב |
| `feedback.explain` | בואו נבין יחד |
| `feedback.answerWas` | התשובה הנכונה: |
| `feedback.lookAtLines` | חפשו את התשובה בשורות המסומנות בקטע |
| `feedback.ineq.greater` | כל מספר גדול מ־{bound} מתאים. למשל {example} |
| `feedback.ineq.less` | כל מספר קטן מ־{bound} מתאים. למשל {example} |
| `feedback.riddle.solution` | כך מגלים את המספרים, שורה אחרי שורה: |
| `feedback.digit.solution` | כך נראה התרגיל עם הספרה הנכונה: |

## Hints for generated math items

| Key | Placeholder (unvocalized) |
|---|---|
| `hint.exercise.add` | חברו קודם את העשרות, ואחר כך את האחדות |
| `hint.exercise.sub` | החסירו קודם את העשרות, ואחר כך את האחדות |
| `hint.exercise.mul` | כפל הוא חיבור חוזר: {a} פעמים {b} |
| `hint.missing.add` | כמה צריך להוסיף ל־{a} כדי להגיע ל־{c}? |
| `hint.missing.sub` | כמה צריך להוריד מ־{a} כדי להגיע ל־{c}? |
| `hint.missing.subFirst` | מאיזה מספר מורידים {a} ומקבלים {c}? נסו לחבר {c} ועוד {a} |
| `hint.missing.mul` | באיזה מספר כופלים את {a} כדי לקבל {c}? |
| `hint.ineq.same` | שני הצדדים מתחילים באותו מספר. מספיק להשוות את המספר השני |
| `hint.ineq.near` | המספרים הראשונים כמעט שווים. בדקו בכמה הם שונים |
| `hint.riddle` | התחילו מהשורה שבה יש רק סוג אחד של ציור |
| `hint.digit` | נסו להציב ספרה במקום הצורה ובדקו אם יוצא נכון |

## Results screen

| Key | Placeholder (unvocalized) |
|---|---|
| `results.title` | סיימתם את הסבב! |
| `results.perfect` | בלי אף טעות! |
| `results.good` | עבודה יפה! |
| `results.keepGoing` | כל תרגול מחזק. ממשיכים! |
| `results.score` | {n} מתוך {total} נכון כבר בניסיון הראשון |
| `results.levelUp` | עליתם לשלב {n}! |
| `results.again` | עוד סבב |
| `results.toMap` | חזרה למפה |
| `results.reviewAdded` | {n} שאלות יחזרו בסבב הבא |

## Sticker album (T5)

| Key | Placeholder (unvocalized) |
|---|---|
| `album.title` | האלבום שלי |
| `album.count` | {n} מתוך {total} |
| `album.locked` | מדבקה שעוד מחכה לכם |
| `album.streak` | {n} ימים ברצף |
| `album.streak.one` | יום ראשון ברצף |
| `album.how` | איך מקבלים מדבקה? |
| `album.rule.threeStars` | סבב עם שלושה כוכבים |
| `album.rule.fiveSessions` | כל חמישה סבבים |
| `album.rule.streak` | יומיים, ארבעה ושישה ימים ברצף |
| `album.rule.mock` | מבחן דמה עד הסוף |

## Sticker reward (T5)

| Key | Placeholder (unvocalized) |
|---|---|
| `sticker.new` | מדבקה חדשה! |
| `sticker.reason.three-stars` | סבב עם שלושה כוכבים! |
| `sticker.reason.five-sessions` | עוד חמישה סבבים! |
| `sticker.reason.streak` | {n} ימים ברצף! |
| `sticker.reason.mock` | סיימתם מבחן דמה! |
| `sticker.toAlbum` | לאלבום |
| `sticker.ok` | יופי! |

## Mini-games corner (T5)

| Key | Placeholder (unvocalized) |
|---|---|
| `games.title` | משחקים |
| `games.best` | השיא: {n} |
| `games.new` | עוד לא שיחקתם |
| `games.race.title` | מרוץ חשבון |
| `games.race.how` | פתרו כמה שיותר תרגילים לפני שהזמן נגמר |
| `games.catch.title` | תפסו את המספר |
| `games.catch.how` | געו בבועה עם מספר שמתאים לתרגיל |
| `games.detective.title` | בלש השורות |
| `games.detective.how` | מצאו באיזו שורה כתובה המילה, וגעו בשורה |
| `games.builder.title` | חידות בציורים — בונים |
| `games.builder.how` | גררו ציורים לשורה עד שהחשבון יוצא נכון |

## Inside a mini-game (T5)

| Key | Placeholder (unvocalized) |
|---|---|
| `game.start` | יוצאים! |
| `game.time` | זמן |
| `game.quit` | יציאה למשחקים |
| `game.over` | הזמן נגמר! |
| `game.final` | {n} נקודות |
| `game.final.one` | נקודה אחת |
| `game.record` | שיא חדש! |
| `game.bestWas` | השיא שלכם: {n} |
| `game.again` | עוד פעם |
| `game.toGames` | למשחקים |
| `game.race.lap` | הקפה {n} |
| `game.detective.ask` | באיזו שורה כתוב |
| `game.detective.line` | שורה {n} |
| `game.builder.target` | צריך להגיע ל־{n} |
| `game.builder.got` | יצא {n}. נסו לשנות |
| `game.builder.clear` | ניקוי השורה |
| `game.builder.tray` | ציורים |

