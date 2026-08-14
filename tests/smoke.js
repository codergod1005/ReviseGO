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

// jsdom does not fetch <script src>, so inject the file contents as REAL script
// elements. window.eval() would run them in a function scope, where app.js's
// top-level `const questions` never becomes a global — which is a property of
// the harness, not of the page.
for (const f of ["profile.js", "data/questions.js", "app.js", "enhance.js"]) {
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
const jsSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8")
            + fs.readFileSync(path.join(ROOT, "enhance.js"), "utf8");
const wantedIds = [...jsSrc.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]/g)].map(m => m[1]);
const missingIds = [...new Set(wantedIds)].filter(id => !$(id));
check("every getElementById target exists", missingIds.length === 0,
      missingIds.length ? "missing: " + missingIds.join(", ") : `${new Set(wantedIds).size} ids`);

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
for (const f of ["profile.js", "data/questions.js", "app.js", "enhance.js"]) {
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
