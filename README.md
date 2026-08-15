# ReviseGo

Revision, but actually fun. A GCSE revision arcade — answer questions, build combos, earn XP
and level up. No build step: it is HTML, CSS and JavaScript, so `index.html` opens straight in
a browser.

```
index.html        markup + the SVG icon sprite
ui.js             toasts and dialogs, replacing alert/confirm/prompt
style.css         the design system (all colour lives in :root)
profile.js        player profiles, premium and game unlocks — LOADS FIRST
app.js            Quick Battle — questions, scoring, lives, XP, levels, achievements
enhance.js        review, progress, charts, profile, level-up, XP bonuses (wraps app.js)
modes.js          Speed Run and Boss Battle — their own loop, shared recorder
accounts.js       sign-in, PBKDF2 hashing, friends and room logic
social.js         the UI for the auth gate, friends and rooms
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

Neutral near-black, **electric indigo-blue** for anything you press, **amber** for score and
levels, warm **orange** for streaks.

Two rules shape the whole palette:

1. **Green and red belong to answers.** Green means "right", red means "wrong", so neither can
   also be the brand colour without feedback losing its meaning.
2. **The brand has to be cool**, so warm red stays unambiguous for a wrong answer. An orange or
   magenta brand would sit right next to it. That rules out most of the obvious arcade choices,
   which is why a blue leads.

Green and red measure only ΔE 6.8 apart under deuteranopia — below the safe floor. They are kept
because **neither ever appears alone**: a revealed answer carries a tick or a cross as well as a
colour. Remove those glyphs and right/wrong stops being legible for roughly 1 in 12 boys.

All colour is defined as custom properties in `:root` in `style.css`. Change it there and it
changes everywhere; there is no raw hex anywhere else in the stylesheet.

Interface icons are inline SVG (`<symbol>` sprite at the top of `index.html`), not emoji. Emoji
render as a different picture on every platform, cannot take the theme colour, and are announced
by a screen reader as their unicode name — "fire", "collision" — instead of what they label.

## No browser popups

`alert`, `confirm` and `prompt` are gone, replaced by `ui.js`. They broke the app in three ways:
they are styled by the operating system so they look like a security warning rather than part of
a game; they **freeze the whole page**, including a Speed Run countdown; and mobile browsers can
suppress them entirely, which means an "are you sure?" the user never sees.

In their place: a non-blocking **toast** for "that happened", and a real **dialog** for the two
questions that need an answer. The dialog traps Tab inside itself, closes on Escape, restores
focus to whatever opened it, and marks the rest of the page `inert` — the accessibility work
that is usually skipped, and the reason hand-rolled dialogs are normally worse than the native
one they replaced. A test asserts no popup can come back.

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
(the caption names it), and it sidesteps the palette's one real hazard — the correct/wrong pair
at ΔE 6.8 under deuteranopia — by never putting two categories in one chart at all. The activity
bars are blue, the accuracy line is amber, and they live in separate figures.

Every chart has a `View as table` fallback and an `aria-label`.

## Accounts, and what the password actually does

There is a username and password, and the app is gated behind it. **It is not real security,
and the sign-in screen says so in plain words.**

There is no server. Everything lives in this browser, so anyone who can open devtools here can
read the accounts and delete them. The sign-in is a *"who is playing"* gate — the thing that
stops your brother opening your XP — not a lock on private data. It cannot be, without a
backend.

What it does do properly, because doing it badly would be worse than not doing it:

- **Passwords are never stored.** Only a PBKDF2-SHA256 hash, 210,000 iterations, with a random
  16-byte salt per account. A test asserts the plaintext appears nowhere in storage.
- **Wrong username and wrong password give the identical message.** Different messages are a way
  to find out which usernames exist.
- **Changing a password re-salts**, so the stored hash changes.

Why hash at all if it isn't secure? Because people reuse passwords. Storing `hunter2` in plain
text would hand over a password that probably opens something that matters. Hashing costs
nothing and removes that.

Each account gets its own save slot via `profile.js`. The first profile keeps the original
un-suffixed storage keys, so anyone already playing keeps the XP they earned.

## Friends and study rooms, without a server

You cannot look someone up if there is nothing to look them up in. So both features work by
**exchanging codes**, which is the honest version of multiplayer with no backend. Nothing here
pretends a friend is online.

**Friends** — you each have a *player card*: one copyable blob holding your name, level, XP and
streak. Send yours, paste theirs, and the leaderboard fills. Re-pasting a newer card is how a
friend's numbers update, and the UI labels how old each row is rather than implying live data.

**Study rooms** — a room code *seeds the question order*, so everyone who joins that code gets
exactly the same ten questions in the same order. That is what makes the scores comparable. You
play, get a result code, and paste each other's in. A worse re-submission never overwrites a
better one.

The seeding uses xorshift32 rather than `Math.random()`, because the whole requirement is that
two different devices produce the identical order — and `Math.random()` cannot be reproduced.

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
