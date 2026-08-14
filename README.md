# ReviseGo

Revision, but actually fun. A GCSE revision arcade — answer questions, build combos, earn XP
and level up. No build step: it is HTML, CSS and JavaScript, so `index.html` opens straight in
a browser.

```
index.html        markup + the SVG icon sprite
style.css         the design system (all colour lives in :root)
app.js            the game — questions, scoring, lives, XP, levels, achievements
enhance.js        review, progress, daily goal and keyboard play (wraps app.js)
data/questions.js the question bank
tests/smoke.js    plays a full game headlessly and checks nothing broke
```

## Running it

Open `index.html`. That is the whole setup.

## Tests

```bash
npm install     # jsdom only
npm test
```

`tests/smoke.js` loads the real page, plays a game, deliberately gets every answer wrong, then
checks the mistakes were recorded, the review list filled, a retry round built, a correct answer
retired the mistake, and the progress screen rendered. It also asserts every `<use href="#…">`
resolves to a real symbol and every `getElementById` in the JS finds its element — the two
failures that otherwise show up as a silently blank patch of screen.

## Design

The theme is an arcade cabinet: deep ink, **electric cyan** for anything you press, **coin gold**
for score and levels, **coral** for streaks.

One rule shapes the whole palette: **green and red belong to answers.** In a quiz, green means
"right" and red means "wrong", so neither can also be the brand colour without feedback losing
its meaning. That is why cyan leads even though the obvious arcade choice is neon red.

All colour is defined as custom properties in `:root` in `style.css`. Change it there and it
changes everywhere; there is no raw hex anywhere else in the stylesheet.

Interface icons are inline SVG (`<symbol>` sprite at the top of `index.html`), not emoji. Emoji
render as a different picture on every platform, cannot take the theme colour, and are announced
by a screen reader as their unicode name — "fire", "collision" — instead of what they label.

## Adding questions

Append to the array in `data/questions.js`:

```js
{
    id: "maths-034",          // must be unique — the review list tracks by id
    subject: "Maths",         // must match a subject button in index.html
    topic: "Algebra",         // grouped per subject on the progress screen
    difficulty: "Easy",
    question: "What is 3x when x = 4?",
    options: ["7", "12", "34", "43"],
    answer: 1,                // INDEX into options, not the value
    explanation: "3 × 4 = 12."
},
```

`answer` is an index. Getting that wrong marks the right answer as wrong for every player who
sees the question, and nothing will warn you, so it is worth double-checking.
