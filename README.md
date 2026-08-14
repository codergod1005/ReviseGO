# ReviseGo

Revision, but actually fun. A GCSE revision arcade — answer questions, build combos, earn XP
and level up. No build step: it is HTML, CSS and JavaScript, so `index.html` opens straight in
a browser.

```
index.html        markup + the SVG icon sprite
style.css         the design system (all colour lives in :root)
profile.js        player profiles, premium and game unlocks — LOADS FIRST
app.js            Quick Battle — questions, scoring, lives, XP, levels, achievements
enhance.js        review, progress, charts, profile, level-up, XP bonuses (wraps app.js)
modes.js          Speed Run and Boss Battle — their own loop, shared recorder
data/questions.js the question bank
tests/smoke.js    plays a full game headlessly and checks nothing broke
```

`profile.js` must stay first in `index.html`. `app.js` reads saved XP on its very last line,
and profiles work by redirecting those reads to the active player — so the redirect has to be
installed before it runs.

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

## Game modes

| Mode | Rules | Unlock |
|---|---|---|
| **Quick Battle** | 10 questions, 3 lives, 15s each | Free |
| **Speed Run** | 60 seconds, no lives. Right answers add a second, wrong ones cost three. | Level 5 + Premium |
| **Boss Battle** | Harder questions. Correct answers damage the boss, wrong ones cost you health. Combo raises the damage. | Level 3 + Premium |

All three feed the same review list, stats and daily goal — a mistake made in Speed Run turns up
on **My Mistakes** exactly like one from Quick Battle.

Level is checked *before* premium on purpose: telling someone to buy premium for a game they
still couldn't play would be selling them something that doesn't do what they think.

## Charts

Hand-rolled inline SVG in `enhance.js` — a charting library would be a bigger download than this
entire app.

Both charts are **single series** deliberately. That lets each use one strong hue with no legend
(the caption names it) and avoids the one real colour hazard in this theme: the green and gold
sit only ΔE 6.6 apart under protanopia, so they must never be adjacent categories in the same
chart. Two charts, one series each, no such pair. Every chart has a `View as table` fallback and
an `aria-label`.

## Players ("accounts")

These are **local save slots, not sign-in.** No server, no password, nothing synced. Two people
can share a laptop and keep separate XP, levels and review lists; the same person on a different
device starts from scratch. The UI says "on this device" for that reason, and there is no
password box — a password field that protects nothing teaches people their password is safe
when it isn't.

Real accounts need a backend to store the data and verify who you are. When you add one,
`profile.js` is the only file that needs to change.

The first profile deliberately keeps the original un-suffixed storage keys, so anyone who was
already playing keeps the XP they earned instead of being reset to level 1 by the update.

## Premium

Payment goes to **Stripe's own hosted checkout** via a Payment Link. ReviseGo never sees a card
number and there is no card form in this repo — a checkout box that looks real but isn't is
worse than none, because it teaches people to type card details into anything that asks.

To turn it on:

1. Stripe Dashboard → **Payment links** → create one for ReviseGo Premium.
2. Paste the URL into `PAYMENT_LINK` at the top of the premium section in `profile.js`.
3. Set the codes in `CODES` to whatever you'll send buyers after purchase.

**The honest gap:** verifying *"this person actually paid"* needs a webhook and a server, which
a static site doesn't have. So buyers redeem an unlock code instead, and those codes live in
`profile.js` — which means someone determined can open devtools and read them. That is the
standard trade-off for a serverless app. The fix is a backend, not a better hiding place, so
treat premium as honour-system until you have one.

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
