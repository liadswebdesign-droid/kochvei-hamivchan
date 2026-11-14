# dev-fixtures — NOT FOR SHIPPING

Tiny placeholder content so the app runs before `content/build/` exists. Unvocalized, written only to exercise the
layout (one passage with 5 questions, 5 word problems, and `ui.json`).

- `npm run dev` uses these automatically when `content/build/` is incomplete (with a console warning).
- `npm run build` (strict) **fails** when `content/build/` is missing a required file; it never falls back to these.
- `npm run build:preview` builds with them explicitly (`KH_ALLOW_FIXTURES=1`) and the app shows a "preview" banner.

`ui.json` here is also the master list of UI keys the app uses: `scripts/content.mjs` fails a strict build if
`content/build/ui.json` lacks any of them. Keep it in sync with `../UI_KEYS.md` (`npm run ui-keys` regenerates that file).
