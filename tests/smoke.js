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
for (const f of ["data/questions.js", "app.js", "enhance.js"]) {
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
