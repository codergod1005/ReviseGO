/**
 * Load ReviseGO in jsdom and actually PLAY it, rather than reading the code and
 * hoping. Everything here is a behaviour the user would notice breaking.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

// Resolved from this file, so the test runs from any working directory.
const ROOT = path.join(__dirname, "..");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => {
    // jsdom implements no layout engine, so scrollTo is absent. Not an app fault.
    if (/Not implemented/.test(e.message)) return;
    errors.push("jsdomError: " + e.message);
});
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), {
    runScripts: "dangerously",
    resources: undefined,          // don't fetch the Google Fonts CSS
    url: "http://localhost/",
    virtualConsole: vc,
    pretendToBeVisual: true,
});

const { window } = dom;

// jsdom ships no WebCrypto SubtleCrypto, which every real browser has and which
// accounts.js needs for PBKDF2. Lending it Node's is the accurate simulation —
// without it the harness would be testing the "no crypto" refusal path instead
// of the real one.
if (!window.crypto || !window.crypto.subtle) {
    Object.defineProperty(window, "crypto", {
        value: require("crypto").webcrypto,
        configurable: true
    });
}
if (typeof window.TextEncoder === "undefined") window.TextEncoder = TextEncoder;

// jsdom does not fetch <script src>, so inject the file contents as REAL script
// elements. window.eval() would run them in a function scope, where app.js's
// top-level `const questions` never becomes a global — which is a property of
// the harness, not of the page.
for (const f of ["ui.js", "profile.js", "data/questions.js", "app.js", "enhance.js", "modes.js", "accounts.js", "social.js"]) {
    const el = window.document.createElement("script");
    el.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
    try {
        window.document.body.appendChild(el);
    } catch (e) {
        errors.push(`EXCEPTION loading ${f}: ${e.message}`);
    }
}
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

const $ = id => window.document.getElementById(id);
// `let` globals are not window properties; reach them the way the page does.
const g = expr => window.eval(expr);
const results = [];
function check(name, condition, detail) {
    results.push({ name, pass: !!condition, detail: detail || "" });
}

// If an await never settles, Node exits when the event loop empties — silently,
// with no output at all, which looks exactly like a passing run. This prints
// where it got to instead.
let reported = false;
process.on("exit", () => {
    if (reported) return;
    console.log("\nHARNESS STALLED after " + results.length + " checks.");
    console.log("Last check: " + (results.length ? results[results.length - 1].name : "none"));
});

// ---- structure -------------------------------------------------------------
check("questions loaded", g("typeof questions !== 'undefined' && questions.length > 0"),
      `${g("questions.length")} questions`);

check("home screen active", $("home-screen").classList.contains("active"));

// Every <use href="#..."> must resolve to a <symbol> that exists, or the icon
// silently renders as nothing at all.
const symbolIds = new Set(
    [...window.document.querySelectorAll("symbol")].map(s => s.id));
const missingIcons = new Set();
[...window.document.querySelectorAll("use")].forEach(u => {
    const ref = (u.getAttribute("href") || "").replace("#", "");
    if (ref && !symbolIds.has(ref)) missingIcons.add(ref);
});
check("every icon reference resolves", missingIcons.size === 0,
      missingIcons.size ? "missing: " + [...missingIcons].join(", ") : `${symbolIds.size} symbols`);

// Every getElementById in the JS must find something, or a feature is dead.
const jsSrc = ["app.js", "enhance.js", "modes.js", "profile.js", "accounts.js", "social.js", "ui.js"]
    .map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
const wantedIds = [...jsSrc.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]/g)].map(m => m[1]);
const missingIds = [...new Set(wantedIds)].filter(id => !$(id));
check("every getElementById target exists", missingIds.length === 0,
      missingIds.length ? "missing: " + missingIds.join(", ") : `${new Set(wantedIds).size} ids`);

// Every inline onclick must resolve to a real function. A typo here is a button
// that looks fine and does nothing, which no amount of styling will reveal.
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const handlers = [...html.matchAll(/onclick="(\w+)\(/g)].map(m => m[1]);
const deadHandlers = [...new Set(handlers)].filter(fn => typeof window[fn] !== "function");
check("every onclick handler exists", deadHandlers.length === 0,
      deadHandlers.length ? "missing: " + deadHandlers.join(", ")
                          : new Set(handlers).size + " handlers");

// ---- no purple anywhere ----------------------------------------------------
const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
// Strip comments first: the stylesheet EXPLAINS that it replaced the purple theme,
// and matching that prose would fail the check on its own changelog.
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");
const purple = cssCode.match(/--purple|#8b5cf6|#a78bfa|#7c3aed|#6d28d9|#a855f7|\bviolet\b|\bpurple\b/gi) || [];
check("no purple left in the stylesheet", purple.length === 0,
      purple.length ? "found: " + [...new Set(purple)].join(", ") : "clean");

// ---- play a full game ------------------------------------------------------
window.startGame("Maths");
check("game screen opens", $("game-screen").classList.contains("active"));
check("10 questions queued", g("currentQuestions.length") === 10,
      String(g("currentQuestions.length")));
check("answer buttons rendered", $("answers").children.length === 4,
      $("answers").children.length + " buttons");
check("answer buttons carry the 1-4 key hint",
      $("answers").children[0].getAttribute("data-key") === "1");
check("lives render as svg, not emoji",
      $("lives").querySelectorAll("use").length === 3 && !/❤/.test($("lives").textContent),
      $("lives").querySelectorAll("use").length + " hearts");

// Answer every question WRONG on purpose, so the mistakes list has to fill up.
let guard = 0;
while ($("game-screen").classList.contains("active") && guard++ < 40) {
    const q = g("currentQuestions[currentQuestion]");
    if (!q) break;
    const wrongIndex = q.answer === 0 ? 1 : 0;
    const btn = $("answers").children[wrongIndex];
    if (!btn) break;
    window.answerQuestion(wrongIndex, btn);
    if (g("lives") <= 0) { window.finishGame(); break; }
    // app.js advances on a timer; drive it directly instead of waiting.
    g("currentQuestion++");
    if (g("currentQuestion") >= 10) { window.finishGame(); break; }
    window.loadQuestion();
}

check("results screen reached", $("results-screen").classList.contains("active"));

const stored = JSON.parse(window.localStorage.getItem("reviseGoMistakes") || "[]");
check("wrong answers were recorded", stored.length > 0, stored.length + " mistakes stored");
check("results screen lists the mistakes",
      /You missed/.test($("result-mistakes").innerHTML),
      $("result-mistakes").innerHTML.slice(0, 60));

const stats = JSON.parse(window.localStorage.getItem("reviseGoStats") || "{}");
check("per-subject stats recorded", stats.subjects && stats.subjects.Maths,
      JSON.stringify(stats.subjects || {}));
check("daily count recorded", Object.keys(stats.days || {}).length === 1,
      JSON.stringify(stats.days || {}));

// ---- review screen ---------------------------------------------------------
window.openReview();
check("review screen opens", $("review-screen").classList.contains("active"));
check("review lists mistake cards",
      $("mistake-list").querySelectorAll(".mistake-card").length > 0,
      $("mistake-list").querySelectorAll(".mistake-card").length + " cards");
check("review shows the correct answer",
      /Answer:/.test($("mistake-list").innerHTML));

// ---- retry, and getting one RIGHT must remove it ---------------------------
const before = JSON.parse(window.localStorage.getItem("reviseGoMistakes")).length;
window.retryMistakes();
check("retry starts a game", $("game-screen").classList.contains("active"));
check("retry pads to a full round", g("currentQuestions.length") === 10,
      String(g("currentQuestions.length")));

const rq = g("currentQuestions[currentQuestion]");
window.answerQuestion(rq.answer, $("answers").children[rq.answer]);
const after = JSON.parse(window.localStorage.getItem("reviseGoMistakes")).length;
check("a correct answer retires the mistake", after === before - 1,
      `${before} -> ${after}`);

// ---- progress --------------------------------------------------------------
window.openProgress();
check("progress screen opens", $("progress-screen").classList.contains("active"));
check("progress tiles render", $("progress-tiles").children.length === 5,
      $("progress-tiles").children.length + " tiles");
check("subject breakdown renders a bar",
      $("subject-breakdown").querySelectorAll(".subject-bar-fill").length > 0);

// ---- home refresh ----------------------------------------------------------
window.showScreen("home-screen");
check("daily goal ring updated", $("goal-count").textContent !== "0/20",
      $("goal-count").textContent);
check("review badge shows a count", $("mistake-count-badge").textContent.trim() !== "",
      "'" + $("mistake-count-badge").textContent + "'");

// ---- no emoji anywhere in the source ---------------------------------------
// The interface is SVG icons now; an emoji creeping back means a glyph that
// renders differently on every platform and reads aloud as "collision".
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2B50}\u{2764}]/u;
["app.js", "enhance.js", "profile.js", "index.html", "style.css"].forEach(f => {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    const hit = text.match(EMOJI);
    check("no emoji in " + f, !hit, hit ? "found " + JSON.stringify(hit[0]) : "clean");
});

// ---- XP and level survive a reload -----------------------------------------
const xpNow = Number(window.localStorage.getItem("reviseGoXP")) || 0;
check("XP was earned and saved", xpNow > 0, xpNow + " XP");

// Rebuild the page from the SAME storage, exactly as a refresh would.
const store = {};
for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    store[k] = window.localStorage.getItem(k);
}

const dom2 = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), {
    runScripts: "dangerously", url: "http://localhost/",
    virtualConsole: vc, pretendToBeVisual: true,
});
Object.keys(store).forEach(k => dom2.window.localStorage.setItem(k, store[k]));
for (const f of ["ui.js", "profile.js", "data/questions.js", "app.js", "enhance.js", "modes.js", "accounts.js", "social.js"]) {
    const el = dom2.window.document.createElement("script");
    el.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
    dom2.window.document.body.appendChild(el);
}
dom2.window.document.dispatchEvent(new dom2.window.Event("DOMContentLoaded"));

const level2 = dom2.window.document.querySelector(".player-level").textContent.trim();
check("level survives a refresh", /LEVEL \d+/.test(level2), level2);
check("XP survives a refresh",
      (Number(dom2.window.localStorage.getItem("reviseGoXP")) || 0) === xpNow,
      dom2.window.localStorage.getItem("reviseGoXP"));
check("total XP shown on the bar after refresh",
      dom2.window.document.getElementById("total-xp").textContent.trim() !== "0",
      dom2.window.document.getElementById("total-xp").textContent);

// ---- profiles ---------------------------------------------------------------
const P = window.Profiles;
check("a default profile exists", P && P.list().length === 1, JSON.stringify(P.list()));
check("existing save is adopted, not orphaned", P.activeId() === "p1",
      "active=" + P.activeId());

const made = P.create("Ola");
check("a second profile can be created", !!made && P.list().length === 2, JSON.stringify(made));

P.switchTo(made.id);
check("switching changes the active profile", P.activeId() === made.id);
check("the new profile starts with no XP",
      (Number(window.localStorage.getItem("reviseGoXP")) || 0) === 0,
      String(window.localStorage.getItem("reviseGoXP")));

P.switchTo("p1");
check("switching back restores the original XP",
      (Number(window.localStorage.getItem("reviseGoXP")) || 0) === xpNow,
      window.localStorage.getItem("reviseGoXP"));

// Deleting must take that player's saves with it, or a reused id inherits them.
P.switchTo(made.id);
window.localStorage.setItem("reviseGoXP", "999");
P.remove(made.id);
check("deleting a profile removes it", P.list().length === 1);
check("deleting a profile deletes its save",
      window.localStorage.getItem("reviseGoXP::" + made.id) === null,
      String(window.localStorage.getItem("reviseGoXP::" + made.id)));
check("the last profile cannot be deleted", P.remove("p1") === false && P.list().length === 1);

// ---- premium ----------------------------------------------------------------
const PR = window.Premium;
check("premium starts locked", PR.isUnlocked() === false);
check("a wrong code is rejected", PR.redeem("NOPE").ok === false, PR.redeem("NOPE").message);
check("an empty code is rejected", PR.redeem("").ok === false);
check("a valid code unlocks premium",
      PR.redeem("arcade-gold").ok === true && PR.isUnlocked() === true,
      "case-insensitive redeem");
check("premium is NOT per-profile (bought once for the device)",
      window.localStorage.getItem("reviseGoPremium") === "true");
check("no card form exists anywhere",
      !/type=["']?(card|cc-number)|cardnumber|card-number/i.test(
          fs.readFileSync(path.join(ROOT, "index.html"), "utf8")),
      "payment goes to Stripe's hosted page");

// ---- game unlocks -----------------------------------------------------------
const boss = window.GAMES.filter(g => g.id === "boss-battle")[0];
check("game registry exists", window.GAMES.length === 3, window.GAMES.length + " games");
window.localStorage.setItem("reviseGoXP", "0");
const lockedAt1 = window.gameLockState(boss);
check("a high-level game is locked at level 1",
      lockedAt1.locked && lockedAt1.reason === "level", lockedAt1.message);
// Level is checked before premium: selling premium for a game you still cannot
// play would be selling something that does not do what the buyer thinks.
check("the level reason wins over the premium reason",
      lockedAt1.message.indexOf("level") !== -1, lockedAt1.message);
window.localStorage.setItem("reviseGoXP", "999999");
check("with the level met and premium bought, it unlocks",
      window.gameLockState(boss).locked === false);

// ---- level up ---------------------------------------------------------------
window.showLevelUp(4);
const popup = window.document.querySelector(".level-up-popup");
check("level-up popup appears", !!popup);
// The visible number COUNTS UP, so it deliberately starts at the previous level
// and lands on the new one a frame later. Asserting either value would test
// nothing, so this checks the announced label, which is correct immediately.
check("level-up announces the new level",
      popup.getAttribute("aria-label") === "Level up. You reached level 4",
      popup.getAttribute("aria-label"));
check("the number starts on the previous level to count up from",
      popup.querySelector("#level-up-number").textContent === "3",
      popup.querySelector("#level-up-number").textContent);
check("level-up has an XP bar to fill", !!popup.querySelector("#level-up-fill"));
check("level-up is announced to screen readers",
      popup.getAttribute("role") === "alertdialog");
check("level-up can be dismissed", !!popup.querySelector("#level-up-close"));
popup.querySelector("#level-up-close").click();

// ---- end-of-game XP bonus ---------------------------------------------------
// Play a clean round: every answer correct, so the perfect-round bonus applies.
window.localStorage.setItem("reviseGoXP", "0");
window.startGame("Maths");
let g2 = 0;
while ($("game-screen").classList.contains("active") && g2++ < 40) {
    const q = g("currentQuestions[currentQuestion]");
    if (!q) break;
    window.answerQuestion(q.answer, $("answers").children[q.answer]);
    g("currentQuestion++");
    if (g("currentQuestion") >= 10) { window.finishGame(); break; }
    window.loadQuestion();
}
check("a bonus breakdown is shown", $("xp-breakdown").innerHTML.indexOf("Bonus XP") !== -1);
check("a perfect round is rewarded",
      $("xp-breakdown").innerHTML.indexOf("Perfect round") !== -1,
      $("xp-breakdown").textContent.replace(/\s+/g, " ").slice(0, 80));
const bonusXP = Number(window.localStorage.getItem("reviseGoXP")) || 0;
check("bonus XP was actually banked", bonusXP > 0, bonusXP + " XP");

// ---- premium modes are real games, not alerts -------------------------------
// Speed Run and Boss Battle used to be `alert("coming next")`. Selling access to
// an alert box is how a paid product earns its first refund.
const appSrc = fs.readFileSync(path.join(ROOT, "modes.js"), "utf8");
check("modes.js defines both premium modes",
      /speed-run/.test(appSrc) && /boss-battle/.test(appSrc));

window.startPremiumGame("Speed Run");
check("premium game asks for a subject first",
      $("mode-subject-screen").classList.contains("active"));

window.startModeWithSubject("Maths");
check("Speed Run starts", $("mode-screen").classList.contains("active"));
check("Speed Run renders a question", $("mode-question").textContent.length > 3,
      $("mode-question").textContent.slice(0, 40));
check("Speed Run renders four answers", $("mode-answers").children.length === 4);
check("Speed Run answers carry key hints",
      $("mode-answers").children[0].getAttribute("data-key") === "1");
check("Speed Run HUD shows a countdown", /seconds/.test($("mode-hud").textContent),
      $("mode-hud").textContent.replace(/\s+/g, " ").trim().slice(0, 50));

// A Speed Run answer must reach the SAME recorder Quick Battle uses. If it did
// not, the review list and the daily goal would silently miss everything played
// in the premium modes. Counting the day's `seen` proves recordAttempt ran,
// whichever way the answer went.
function daySeen() {
    const s = JSON.parse(window.localStorage.getItem("reviseGoStats") || "{}");
    const today = new Date().toISOString().slice(0, 10);
    const row = (s.days || {})[today];
    return typeof row === "number" ? row : (row && row.seen) || 0;
}
const seenBefore = daySeen();
$("mode-answers").children[0].click();
check("Speed Run feeds the shared stats and review list",
      daySeen() === seenBefore + 1, seenBefore + " -> " + daySeen());
check("Speed Run gives feedback", $("mode-feedback").textContent.length > 0,
      $("mode-feedback").textContent.slice(0, 40));

window.quitMode();
check("quitting a mode returns to the arcade",
      $("home-screen").classList.contains("active"));

// Boss Battle
window.startPremiumGame("Boss Battle");
window.startModeWithSubject("");
check("Boss Battle starts", $("mode-screen").classList.contains("active"));
check("Boss Battle shows a boss health bar",
      !!$("mode-hud").querySelector(".hud-boss-fill"));
check("Boss Battle shows player health", /health/.test($("mode-hud").textContent));
window.quitMode();

check("personal bests are stored per mode",
      typeof window.getBest === "function" && typeof window.getBest("speed-run") === "number",
      String(window.getBest("speed-run")));

// ---- progress charts --------------------------------------------------------
window.openProgress();
const activity = $("activity-chart");
check("activity chart renders as inline SVG", !!activity.querySelector("svg"));
check("activity chart has one bar per day",
      activity.querySelectorAll("rect").length === 14,
      activity.querySelectorAll("rect").length + " bars");
check("activity chart bars carry hover titles",
      !!activity.querySelector("rect title"));
check("activity chart is labelled for screen readers",
      /aria-label/.test(activity.innerHTML));
check("activity chart has a table fallback",
      $("activity-table").querySelectorAll("tr").length > 1,
      $("activity-table").querySelectorAll("tr").length + " rows");
check("personal bests grid renders", $("bests-grid").children.length === 4,
      $("bests-grid").children.length + " tiles");

// Only ONE series per chart, which is what makes the theme's green/gold pair
// (delta-E 6.6 under protanopia) safe — they are never adjacent categories.
const chartCss = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");
check("charts use one hue for bars and one for the line",
      /\.chart \.bar \{ fill: var\(--primary\)/.test(chartCss) &&
      /stroke: var\(--gold\)/.test(chartCss));

// ---- premium page -----------------------------------------------------------
window.showScreen("premium-screen");
check("premium page shows both plans",
      window.document.querySelectorAll(".plan").length === 2);
check("premium page has an FAQ",
      window.document.querySelectorAll(".faq details").length >= 4,
      window.document.querySelectorAll(".faq details").length + " questions");
check("the paid plan names real, built features",
      /Speed Run/.test(window.document.querySelector(".plan.best").textContent) &&
      /Boss Battle/.test(window.document.querySelector(".plan.best").textContent));

// ---- profile page -----------------------------------------------------------
window.showScreen("profile-screen");
check("avatar picker renders", $("avatar-picker").children.length === 6,
      $("avatar-picker").children.length + " colours");
$("avatar-picker").children[2].click();
check("choosing an avatar saves it",
      window.localStorage.getItem("reviseGoAvatar") === "green",
      String(window.localStorage.getItem("reviseGoAvatar")));
check("achievements show progress, not just locked",
      window.document.querySelectorAll(".achievement-row .achievement-fill").length > 0,
      window.document.querySelectorAll(".achievement-row").length + " achievements");
check("profile shows how long you've played",
      /Playing for/.test($("profile-since").textContent),
      $("profile-since").textContent);
check("export and import controls exist",
      !!$("export-save") && !!$("import-save") && !!$("import-file"));

// ---- accounts, friends and rooms (async: PBKDF2 is async) -------------------
(async function socialTests() {

    const A = window.Accounts;

    check("the app starts behind a sign-in gate", !$("auth-gate").hidden);
    check("the page behind the gate is inert, not merely hidden",
          window.document.querySelector("main").hasAttribute("inert"),
          "a covered page that still takes Tab focus is still playable");

    // Sign-up validation
    check("a short username is rejected", (await A.signUp("ab", "password1")).ok === false);
    check("a username with spaces is rejected",
          (await A.signUp("bad name", "password1")).ok === false);
    check("a short password is rejected", (await A.signUp("olarevises", "123")).ok === false);

    const made = await A.signUp("ola_revises", "arcade2026");
    check("an account can be created", made.ok === true, made.message || "");
    check("signing up signs you in", A.isSignedIn() === true);
    check("a friend code is issued", /^[A-Z2-9]{6}$/.test(A.myCode()), A.myCode());

    // THE POINT OF HASHING: the password itself must not be anywhere in storage.
    const rawAccounts = window.localStorage.getItem("reviseGoAccounts");
    check("the password is never stored", rawAccounts.indexOf("arcade2026") === -1,
          "storage holds only the hash");
    check("a per-account salt is stored", /"salt":"[0-9a-f]{32}"/.test(rawAccounts));
    check("the stored hash is PBKDF2-length", /"hash":"[0-9a-f]{64}"/.test(rawAccounts));

    check("a duplicate username is refused",
          (await A.signUp("OLA_REVISES", "another1")).ok === false,
          "case-insensitive");

    // Sign in / out
    A.signOut();
    check("signing out clears the session", A.isSignedIn() === false);
    check("a wrong password is refused", (await A.signIn("ola_revises", "wrong")).ok === false);
    check("an unknown user gives the SAME message as a wrong password",
          (await A.signIn("nobody", "whatever")).message ===
          (await A.signIn("ola_revises", "wrong")).message,
          "different messages would leak which usernames exist");
    check("the right password signs in", (await A.signIn("ola_revises", "arcade2026")).ok === true);

    // Changing a password re-salts, so the stored hash must change.
    const hashBefore = JSON.parse(window.localStorage.getItem("reviseGoAccounts"))[0].hash;
    check("the old password is required to change it",
          (await A.changePassword("wrong", "newpass1")).ok === false);
    check("the password can be changed",
          (await A.changePassword("arcade2026", "newpass1")).ok === true);
    const hashAfter = JSON.parse(window.localStorage.getItem("reviseGoAccounts"))[0].hash;
    check("changing the password changes the stored hash", hashBefore !== hashAfter);
    check("the new password works", (await A.signIn("ola_revises", "newpass1")).ok === true);

    // ---- friends ------------------------------------------------------------
    const F = window.Friends;
    const myCard = F.myCard();
    check("a player card is produced", myCard.length > 20);
    check("your own card is refused", F.add(myCard).ok === false,
          F.add(myCard).message);
    check("junk is refused as a card", F.add("not-a-card").ok === false);

    // A friend's card, built the way a second device would produce one.
    const friendCard = window.btoa(unescape(encodeURIComponent(JSON.stringify({
        t: "revisego-card", code: "ZZZ234", name: "Daniel",
        xp: 99999, level: 9, answered: 400, correct: 380, streak: 5, at: Date.now()
    }))));
    check("a friend's card is accepted", F.add(friendCard).ok === true);
    check("the friend is stored", F.list().length === 1, F.list().length + " friends");

    const updated = F.add(friendCard);
    check("re-pasting a card updates rather than duplicating",
          updated.updated === true && F.list().length === 1);

    const board = F.leaderboard();
    check("the leaderboard includes you and your friends", board.length === 2);
    check("the leaderboard is sorted by XP", board[0].xp >= board[1].xp,
          board.map(r => r.name + ":" + r.xp).join(", "));

    window.openFriends();
    check("friends screen opens", $("friends-screen").classList.contains("active"));
    check("friends board renders rows",
          $("friends-board").querySelectorAll(".board-row").length === 2);
    check("your own row is marked", !!$("friends-board").querySelector(".board-row.me"));

    F.remove("ZZZ234");
    check("a friend can be removed", F.list().length === 0);

    // ---- study rooms --------------------------------------------------------
    const R = window.Rooms;
    const room = R.create("Maths before the test", "Maths");
    check("a room can be created", /^[A-Z2-9]{6}$/.test(room.code), room.code);
    check("a bad room code is refused", R.join("XY").ok === false);
    check("joining a code you were given creates it locally",
          R.join("ABC234").ok === true);

    // THE WHOLE POINT: the same code must give the same questions on every device.
    const setA = R.questionsFor("ABC234", "Maths").map(q => q.id).join(",");
    const setB = R.questionsFor("ABC234", "Maths").map(q => q.id).join(",");
    const setC = R.questionsFor("ZZZ999", "Maths").map(q => q.id).join(",");
    check("a room code always produces the same questions", setA === setB,
          setA.slice(0, 40) + "...");
    check("a different code produces different questions", setA !== setC);
    check("a room round is 10 questions", R.questionsFor("ABC234", "Maths").length === 10);

    const resultCode = R.resultCode("ABC234", 7, 10);
    check("a result code is produced", resultCode.length > 20);
    check("submitting a result adds it to the room", R.submit(resultCode).ok === true);
    check("the room now has a result", R.get("ABC234").results.length === 1);

    // A worse re-submission must not knock someone down their own table.
    R.submit(R.resultCode("ABC234", 3, 10));
    check("a worse result does not overwrite a better one",
          R.get("ABC234").results[0].score === 7,
          "score stayed " + R.get("ABC234").results[0].score);

    check("a result for a room you're not in is refused",
          R.submit(window.btoa(unescape(encodeURIComponent(JSON.stringify({
              t: "revisego-result", room: "NOPE22", name: "X", score: 1, total: 10
          }))))).ok === false);

    window.openRooms();
    check("rooms screen opens", $("rooms-screen").classList.contains("active"));
    check("rooms are listed", $("room-list").querySelectorAll(".room-card").length === 2,
          $("room-list").querySelectorAll(".room-card").length + " rooms");

    R.leave("ABC234");
    check("a room can be left", R.list().length === 1);

    // ---- no browser popups anywhere -----------------------------------------
    // alert/confirm/prompt are styled by the OS so they look like a security
    // warning, they freeze the page including a Speed Run countdown, and mobile
    // browsers can suppress them entirely — which means an "are you sure?" the
    // user never sees.
    const POPUP = /(^|[^.\w])(alert|confirm|prompt)\s*\(/;
    ["app.js", "enhance.js", "social.js", "modes.js", "profile.js", "accounts.js"]
        .forEach(f => {
            const src = fs.readFileSync(path.join(ROOT, f), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")     // strip comments: they discuss popups
                .replace(/^\s*\/\/.*$/gm, "");
            const hit = src.match(POPUP);
            check("no browser popups in " + f, !hit,
                  hit ? "found " + hit[0].trim() : "clean");
        });

    // ---- the dialog layer ---------------------------------------------------
    const confirmPromise = UI_confirmOpen();
    function UI_confirmOpen() {
        return window.UI.confirm({ title: "Delete this?", body: "It cannot be undone.",
                                   confirm: "Delete", danger: true });
    }

    const dlg = window.document.querySelector(".dialog");
    check("a dialog renders instead of a browser popup", !!dlg);
    check("the dialog is a real modal for screen readers",
          dlg.getAttribute("role") === "dialog" &&
          dlg.getAttribute("aria-modal") === "true");
    check("the dialog is labelled by its title",
          dlg.getAttribute("aria-labelledby") === "dlg-title" &&
          !!dlg.querySelector("#dlg-title"));
    check("the page behind the dialog is inert",
          window.document.querySelector("main").hasAttribute("inert"),
          "otherwise Tab walks into a page you cannot see");
    check("a destructive confirm looks destructive",
          !!dlg.querySelector(".danger-button.solid"),
          "the dangerous choice must not be styled as the primary one");
    check("focus moves into the dialog",
          dlg.contains(window.document.activeElement),
          String(window.document.activeElement && window.document.activeElement.className));

    dlg.querySelector('[data-act="ok"]').click();
    check("confirming resolves true", (await confirmPromise) === true);

    // Escape must cancel, or a keyboard user is stuck in the dialog.
    const escPromise = window.UI.confirm({ title: "Sure?" });
    const esc = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    window.document.dispatchEvent(esc);
    check("Escape cancels the dialog", (await escPromise) === false);

    await new Promise(r => setTimeout(r, 220));
    check("the page is interactive again after a dialog closes",
          !window.document.querySelector("main").hasAttribute("inert"));

    // Prompt
    const promptPromise = window.UI.prompt({ title: "Rename", label: "Name", value: "Ola" });
    const liveDialog = () => window.document.querySelector(".dialog-back:last-of-type .dialog");
    const field = liveDialog().querySelector("#dlg-input");
    check("a prompt renders a text field", !!field, field ? field.value : "");
    field.value = "  Daniel  ";
    liveDialog().querySelector('[data-act="ok"]').click();
    check("a prompt returns the trimmed value", (await promptPromise) === "Daniel");

    const cancelled = window.UI.prompt({ title: "Rename", label: "Name" });
    liveDialog().querySelector('[data-act="cancel"]').click();
    check("a cancelled prompt resolves null", (await cancelled) === null);

    // A note has nothing to decline, so it must not offer Cancel.
    const notePromise = window.UI.note({ title: "Heads up", body: "Something happened." });
    check("a note shows only one button",
          !liveDialog().querySelector('[data-act="cancel"]'));
    liveDialog().querySelector('[data-act="ok"]').click();
    await notePromise;

    // Toasts
    window.UI.ok("Saved.");
    const toastEl = window.document.querySelector(".toast");
    check("a toast renders", !!toastEl, toastEl ? toastEl.textContent.trim() : "");
    check("toasts are announced politely",
          window.document.querySelector(".toast-host").getAttribute("aria-live") === "polite");
    check("toast text is escaped, not parsed as markup", (function () {
        window.UI.info("<img src=x onerror=alert(1)>");
        const t = window.document.querySelectorAll(".toast");
        const last = t[t.length - 1];
        return !last.querySelector("img");
    })(), "usernames and room names end up in toasts");

    // ---- the gate lets you through once signed in ---------------------------
    window.refreshAuthGate();
    check("the gate is down once signed in", $("auth-gate").hidden === true);
    check("the page is interactive again",
          !window.document.querySelector("main").hasAttribute("inert"));

    report();
})().catch(e => {
    // Without this, a throw inside the async block exits silently with no output
    // at all — which looks like the suite passing.
    console.error("\nTEST HARNESS THREW:", e && e.stack || e);
    process.exit(1);
});

function report() {
reported = true;
// ---- report ----------------------------------------------------------------
let failed = 0;
for (const r of results) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? "  — " + r.detail : ""}`);
}
if (errors.length) {
    console.log("\nRUNTIME ERRORS:");
    [...new Set(errors)].slice(0, 12).forEach(e => console.log("  " + e));
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed || errors.length ? 1 : 0);
}
