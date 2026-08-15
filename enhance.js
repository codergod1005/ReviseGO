/* =========================================================
   REVISEGO — ENHANCEMENTS
   =========================================================

   Loaded AFTER app.js, and deliberately additive: it wraps the
   existing functions rather than rewriting them. app.js is 2,600
   lines of working game logic, and the fastest way to break a
   working game is to retype it.

   The wrap pattern used throughout:

       const _original = someFunction;
       someFunction = function (...) { ...extra...; return _original(...); };

   Top-level `function` declarations in app.js are properties of
   window, and its top-level `let` bindings (currentQuestions,
   currentQuestion, lives...) live in the shared global scope, so
   both are reachable from here.

   WHAT THIS ADDS, and why each one earns its place in a revision app:

     • MISTAKES LIBRARY  — every question you get wrong is kept, with
       the right answer and the explanation, and you can retry just
       those. A quiz that only gives you a score tells you that you
       failed; it doesn't help you stop failing. Borrowed from
       Brainify's Library.
     • PROGRESS          — accuracy per subject and per topic, so
       "revise more" becomes "revise ratios". Borrowed from
       Brainify's Analytics.
     • DAILY GOAL        — one honest number, replacing the old
       "coming soon" card. Borrowed from Brainify's streak/planner.
     • KEYBOARD PLAY     — 1-4 to answer. It is a quiz; typing is
       faster than aiming, and it makes the game playable without
       a mouse at all.
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       STORAGE
       Every read is defensive: localStorage can hold anything a
       previous version (or a user with devtools) put there, and a
       JSON.parse blowing up on load would take the whole app down
       before the first screen rendered.
    ===================================================== */

    const MISTAKES_KEY = "reviseGoMistakes";
    const STATS_KEY = "reviseGoStats";
    const DAILY_GOAL = 20;

    function readJSON(key, fallback) {
        try {
            const raw = JSON.parse(localStorage.getItem(key));
            return raw === null || typeof raw !== typeof fallback ? fallback : raw;
        } catch (e) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* Private mode, or the quota is full. Losing review history is not
               worth breaking the game over. */
        }
    }

    function getMistakes() {
        const list = readJSON(MISTAKES_KEY, []);
        return Array.isArray(list) ? list : [];
    }

    function getStats() {
        const s = readJSON(STATS_KEY, {});
        return {
            subjects: s.subjects || {},
            topics: s.topics || {},
            days: s.days || {}
        };
    }

    const todayKey = () => new Date().toISOString().slice(0, 10);

    // A day is {seen, correct}. Older saves hold a plain number, so both shapes
    // have to read cleanly or an update would wipe someone's history.
    function dayRow(value) {
        if (typeof value === "number") return { seen: value, correct: 0 };
        if (value && typeof value === "object") {
            return { seen: value.seen || 0, correct: value.correct || 0 };
        }
        return { seen: 0, correct: 0 };
    }


    /* =====================================================
       RECORDING
    ===================================================== */

    // Mistakes made in the current game only, so the results screen can show
    // "here is what you got wrong" without trawling the whole history.
    let sessionMistakes = [];

    function recordAttempt(question, chosenIndex, wasCorrect) {
        if (!question || !question.id) return;

        const stats = getStats();

        function bump(bucket, name) {
            if (!name) return;
            const row = bucket[name] || { seen: 0, correct: 0 };
            row.seen += 1;
            if (wasCorrect) row.correct += 1;
            bucket[name] = row;
        }

        bump(stats.subjects, question.subject);
        // Topics are namespaced by subject: "Number" means something different
        // in Maths and Science, and merging them would average two unrelated
        // things into one meaningless bar.
        bump(stats.topics, question.subject + " · " + question.topic);

        // Days used to be a bare count, which is enough for the daily goal but
        // cannot answer "was I any good that day". Stored as {seen, correct} now,
        // and dayRow() below still reads the old number so existing saves keep
        // their streak instead of resetting to zero on update.
        const key = todayKey();
        const day = dayRow(stats.days[key]);
        day.seen += 1;
        if (wasCorrect) day.correct += 1;
        stats.days[key] = day;

        writeJSON(STATS_KEY, stats);

        const mistakes = getMistakes();
        const at = mistakes.findIndex(m => m.id === question.id);

        if (wasCorrect) {
            // Getting it right RETIRES it from the review list. That is the whole
            // reward loop: the list is meant to shrink.
            if (at !== -1) {
                mistakes.splice(at, 1);
                writeJSON(MISTAKES_KEY, mistakes);
            }
            return;
        }

        const entry = {
            id: question.id,
            subject: question.subject,
            topic: question.topic,
            question: question.question,
            options: question.options,
            answer: question.answer,
            chosen: typeof chosenIndex === "number" ? chosenIndex : -1,
            explanation: question.explanation,
            ts: Date.now(),
            times: 1
        };

        if (at !== -1) {
            // Seen this one before — keep the count rather than duplicating the row,
            // so a question you keep failing rises to the top of the list.
            entry.times = (mistakes[at].times || 1) + 1;
            mistakes.splice(at, 1);
        }

        mistakes.unshift(entry);
        writeJSON(MISTAKES_KEY, mistakes);

        sessionMistakes.push(entry);
    }


    /* =====================================================
       HOOKS INTO THE EXISTING GAME
    ===================================================== */

    const _answerQuestion = window.answerQuestion;

    window.answerQuestion = function (selectedAnswer, selectedButton) {
        // Read the question BEFORE calling through: the original advances
        // currentQuestion, so afterwards this would record the wrong one.
        const q = currentQuestions[currentQuestion];
        if (q) recordAttempt(q, selectedAnswer, selectedAnswer === q.answer);
        return _answerQuestion.apply(this, arguments);
    };


    const _timeRanOut = window.timeRanOut;

    if (typeof _timeRanOut === "function") {
        window.timeRanOut = function () {
            // Running out of time is a wrong answer for revision purposes — you
            // did not know it. chosen is -1 because nothing was picked.
            const q = currentQuestions[currentQuestion];
            if (q) recordAttempt(q, -1, false);
            return _timeRanOut.apply(this, arguments);
        };
    }


    const _startGame = window.startGame;

    window.startGame = function () {
        sessionMistakes = [];
        return _startGame.apply(this, arguments);
    };


    const _finishGame = window.finishGame;

    window.finishGame = function () {
        const out = _finishGame.apply(this, arguments);
        // The bonus is awarded BEFORE the breakdown renders, so the XP total on
        // screen already includes it — showing a breakdown that does not add up
        // to the number beside it is worse than showing no breakdown.
        renderXPBreakdown(awardEndOfGameBonus());
        renderResultMistakes();
        refreshHome();
        renderGameLocks();
        return out;
    };


    // Lives are written with `textContent` in app.js, which would wipe any SVG
    // put in the HTML — so they are re-rendered here, after the original runs.
    const _updateGameStats = window.updateGameStats;

    window.updateGameStats = function () {
        const out = _updateGameStats.apply(this, arguments);
        renderLives();
        markCombo();
        return out;
    };


    const _loadQuestion = window.loadQuestion;

    window.loadQuestion = function () {
        const out = _loadQuestion.apply(this, arguments);
        labelAnswerKeys();
        return out;
    };


    const _updateTimer = window.updateTimer;

    if (typeof _updateTimer === "function") {
        window.updateTimer = function () {
            const out = _updateTimer.apply(this, arguments);
            const box = document.getElementById("timer-box");
            // Urgency is shown by colour AND a pulse, never colour alone.
            if (box) box.classList.toggle("low", timeLeft <= 5);
            return out;
        };
    }


    /* =====================================================
       GAME-SCREEN RENDERING
    ===================================================== */

    function svg(id, cls) {
        return '<svg class="icon ' + (cls || "") + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
    }

    function renderLives() {
        const el = document.getElementById("lives");
        if (!el) return;
        let html = "";
        for (let i = 0; i < 3; i++) {
            html += i < lives
                ? svg("i-heart", "icon-fill")
                : '<span style="opacity:.25">' + svg("i-heart") + "</span>";
        }
        el.innerHTML = html;
        el.setAttribute("aria-label", lives + " of 3 lives remaining");
    }

    function markCombo() {
        const el = document.getElementById("combo-display");
        if (el) el.classList.toggle("hot", combo >= 3);
    }

    // The 1-4 badge on each answer is drawn by CSS from data-key, so it is both
    // the keyboard hint and the ordinal marker.
    function labelAnswerKeys() {
        document.querySelectorAll("#answers .answer-button").forEach((b, i) => {
            b.setAttribute("data-key", i + 1);
        });
    }

    document.addEventListener("keydown", function (e) {
        const gameOpen = document.getElementById("game-screen");
        if (!gameOpen || !gameOpen.classList.contains("active")) return;
        if (e.key < "1" || e.key > "4" || e.altKey || e.ctrlKey || e.metaKey) return;

        const buttons = document.querySelectorAll("#answers .answer-button");
        const button = buttons[Number(e.key) - 1];
        if (button && !button.disabled) {
            e.preventDefault();
            button.click();
        }
    });


    /* =====================================================
       RESULTS — what you got wrong, immediately
    ===================================================== */

    function escapeHTML(s) {
        return String(s == null ? "" : s).replace(/[&<>"]/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }

    function mistakeCard(m) {
        const yours = m.chosen >= 0 && m.options && m.options[m.chosen] != null
            ? escapeHTML(m.options[m.chosen])
            : "No answer — time ran out";
        const right = m.options && m.options[m.answer] != null
            ? escapeHTML(m.options[m.answer]) : "";

        return '' +
            '<div class="mistake-card">' +
                '<div class="mistake-top">' +
                    '<span class="mistake-subject">' + escapeHTML(m.subject) +
                        " · " + escapeHTML(m.topic) + "</span>" +
                    (m.times > 1
                        ? '<span class="game-tag" style="margin:0">missed ' + m.times + "×</span>"
                        : "") +
                "</div>" +
                '<p class="mistake-q">' + escapeHTML(m.question) + "</p>" +
                '<p class="mistake-answer yours">' + svg("i-x") + " You said: " + yours + "</p>" +
                '<p class="mistake-answer right">' + svg("i-check") + " Answer: " + right + "</p>" +
                (m.explanation
                    ? '<p class="mistake-why">' + escapeHTML(m.explanation) + "</p>"
                    : "") +
            "</div>";
    }

    function renderResultMistakes() {
        const host = document.getElementById("result-mistakes");
        if (!host) return;

        if (!sessionMistakes.length) {
            host.innerHTML = '<div class="empty-note">Clean sweep — nothing wrong to review.</div>';
            return;
        }

        host.innerHTML =
            '<div class="section-heading"><div>' +
                '<p class="small-heading">Worth another look</p>' +
                "<h2>You missed " + sessionMistakes.length + "</h2>" +
            "</div></div>" +
            sessionMistakes.map(mistakeCard).join("");
    }


    /* =====================================================
       REVIEW SCREEN
    ===================================================== */

    window.openReview = function () {
        renderReview();
        showScreen("review-screen");
    };

    function renderReview() {
        const list = document.getElementById("mistake-list");
        const intro = document.getElementById("review-intro");
        const retry = document.getElementById("retry-button");
        if (!list) return;

        const mistakes = getMistakes();

        if (!mistakes.length) {
            list.innerHTML =
                '<div class="empty-note">Nothing here yet. Questions you get wrong will ' +
                "collect here so you can hammer them until they stick.</div>";
            if (intro) intro.textContent = "You haven't got anything wrong yet. Play a game.";
            if (retry) retry.style.display = "none";
            return;
        }

        if (retry) retry.style.display = "";
        if (intro) {
            intro.textContent = mistakes.length + " question" +
                (mistakes.length === 1 ? "" : "s") +
                " to fix. Answer one correctly and it leaves this list.";
        }

        // Most-failed first, then most recent: the ones you keep getting wrong are
        // the ones worth seeing at the top.
        list.innerHTML = mistakes
            .slice()
            .sort((a, b) => (b.times || 1) - (a.times || 1) || b.ts - a.ts)
            .map(mistakeCard)
            .join("");
    }

    window.retryMistakes = function () {
        const mistakes = getMistakes();
        if (!mistakes.length) return;

        // Rebuild from the live question bank by id, so an edited question is
        // picked up rather than replayed from a stale copy in storage.
        const byId = {};
        questions.forEach(q => { byId[q.id] = q; });

        let set = mistakes.map(m => byId[m.id]).filter(Boolean);
        if (!set.length) return;

        // app.js hard-codes TOTAL_QUESTIONS as the round length and the accuracy
        // denominator, so a short set has to be padded to fill it. Repeating is
        // the right kind of padding here — this is a drill, and seeing a question
        // you keep failing more than once is the point.
        const source = set.slice();
        let i = 0;
        while (set.length < TOTAL_QUESTIONS) set.push(source[i++ % source.length]);
        set = set.slice(0, TOTAL_QUESTIONS);

        sessionMistakes = [];
        currentSubject = "Review";
        currentQuestions = set;
        currentQuestion = 0;
        score = 0;
        xp = 0;
        lives = 3;
        combo = 0;
        bestCombo = 0;
        correctAnswers = 0;
        questionsPlayed = 0;

        updateGameStats();
        showScreen("game-screen");
        loadQuestion();
    };


    /* =====================================================
       PROGRESS SCREEN
    ===================================================== */

    window.openProgress = function () {
        renderProgress();
        showScreen("progress-screen");
    };

    function pct(row) {
        return row.seen ? Math.round((row.correct / row.seen) * 100) : 0;
    }

    function barRow(name, row) {
        const p = pct(row);
        return '' +
            '<div class="subject-bar-row">' +
                '<div class="subject-bar-head">' +
                    "<strong>" + escapeHTML(name) + "</strong>" +
                    "<span>" + p + "% · " + row.correct + "/" + row.seen + "</span>" +
                "</div>" +
                '<div class="subject-bar-track">' +
                    '<div class="subject-bar-fill' + (p < 50 ? " weak" : "") +
                        '" style="width:' + p + '%"></div>' +
                "</div>" +
            "</div>";
    }

    function renderProgress() {
        const stats = getStats();
        const tiles = document.getElementById("progress-tiles");
        const subjectHost = document.getElementById("subject-breakdown");
        const topicHost = document.getElementById("topic-breakdown");

        const subjects = Object.keys(stats.subjects);
        let seen = 0, correct = 0;
        subjects.forEach(s => { seen += stats.subjects[s].seen; correct += stats.subjects[s].correct; });

        const days = Object.keys(stats.days).length;

        renderActivityChart(stats);
        renderAccuracyChart(stats);
        renderBests();

        if (tiles) {
            tiles.innerHTML =
                tile("i-book", seen, "Questions answered") +
                tile("i-check", correct, "Correct") +
                tile("i-target", (seen ? Math.round(correct / seen * 100) : 0) + "%", "Overall accuracy") +
                tile("i-gamepad", days, days === 1 ? "Day played" : "Days played") +
                tile("i-refresh", getMistakes().length, "Still to fix");
        }

        if (subjectHost) {
            subjectHost.innerHTML = subjects.length
                ? subjects.sort((a, b) => pct(stats.subjects[b]) - pct(stats.subjects[a]))
                    .map(s => barRow(s, stats.subjects[s])).join("")
                : '<div class="empty-note">Play a game and your subjects will show up here.</div>';
        }

        if (topicHost) {
            // Only topics with a few attempts: one unlucky question is not a
            // weakness, and presenting it as one sends you revising the wrong thing.
            const topics = Object.keys(stats.topics).filter(t => stats.topics[t].seen >= 3);
            topicHost.innerHTML = topics.length
                ? topics.sort((a, b) => pct(stats.topics[a]) - pct(stats.topics[b]))
                    .slice(0, 6)
                    .map(t => barRow(t, stats.topics[t])).join("")
                : '<div class="empty-note">Answer a few more questions and your weakest ' +
                  "topics will appear here.</div>";
        }
    }

    /* =====================================================
       CHARTS
       =====================================================

       Hand-rolled inline SVG — a charting library would be a bigger
       download than this entire app.

       Both charts are SINGLE SERIES on purpose. That is what lets each
       one use a single strong hue with no legend (the caption names
       it) and sidesteps the one real colour hazard here: the theme's
       green and gold sit only ΔE 6.6 apart under protanopia, so they
       must never end up as adjacent categories in the same chart.
       Two charts, one series each, no such pair.
    ===================================================== */

    function lastDays(stats, n) {
        const out = [];
        const now = new Date();
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            const row = dayRow(stats.days[key]);
            out.push({ key: key, label: d.getDate(), day: d.getDay(), seen: row.seen, correct: row.correct });
        }
        return out;
    }

    function renderActivityChart(stats) {
        const host = document.getElementById("activity-chart");
        const table = document.getElementById("activity-table");
        if (!host) return;

        const data = lastDays(stats, 14);
        const max = Math.max(1, ...data.map(d => d.seen));

        const W = 100, H = 46, pad = 1.2;
        const slot = W / data.length;
        // A 2px surface gap between bars is what stops a busy chart reading as
        // one solid block.
        const bw = slot - pad * 2;

        const bars = data.map((d, i) => {
            const h = d.seen ? Math.max(2.5, (d.seen / max) * (H - 8)) : 0;
            const x = i * slot + pad;
            const y = H - 6 - h;
            if (!d.seen) {
                // An empty day is drawn as a faint baseline stub, so "nothing"
                // still occupies its slot instead of silently shifting the axis.
                return '<rect class="bar empty" x="' + x.toFixed(2) + '" y="' + (H - 8).toFixed(2) +
                    '" width="' + bw.toFixed(2) + '" height="2" rx="1"><title>' +
                    d.key + ": nothing</title></rect>";
            }
            return '<rect class="bar" x="' + x.toFixed(2) + '" y="' + y.toFixed(2) +
                '" width="' + bw.toFixed(2) + '" height="' + h.toFixed(2) +
                '" rx="1.2"><title>' + d.key + ": " + d.seen + " questions</title></rect>";
        }).join("");

        // Only the ends and the peak get a label — a number on every bar is noise.
        const peak = data.reduce((b, d, i) => d.seen > data[b].seen ? i : b, 0);
        const labels = data.map((d, i) => {
            if (i !== 0 && i !== data.length - 1 && i !== peak) return "";
            const x = i * slot + slot / 2;
            return '<text class="tick" x="' + x.toFixed(2) + '" y="' + (H - 1) +
                '" text-anchor="middle">' + d.label + "</text>";
        }).join("");

        host.innerHTML =
            '<svg viewBox="0 0 ' + W + " " + H + '" class="chart" role="img" ' +
            'aria-label="Questions answered per day over the last 14 days">' +
                '<line class="axis" x1="0" y1="' + (H - 6) + '" x2="' + W + '" y2="' + (H - 6) + '"/>' +
                bars + labels +
            "</svg>" +
            '<p class="chart-note">' + data.reduce((n, d) => n + d.seen, 0) +
            " questions in 14 days · best day " + max + "</p>";

        if (table) {
            table.innerHTML = '<table><thead><tr><th>Date</th><th>Questions</th></tr></thead><tbody>' +
                data.map(d => "<tr><td>" + d.key + "</td><td>" + d.seen + "</td></tr>").join("") +
                "</tbody></table>";
        }
    }

    function renderAccuracyChart(stats) {
        const host = document.getElementById("accuracy-chart");
        const table = document.getElementById("accuracy-table");
        if (!host) return;

        // Only days actually played. Plotting 0% for days you did not revise would
        // draw a crash that never happened.
        const played = lastDays(stats, 14).filter(d => d.seen > 0)
            .map(d => ({ key: d.key, label: d.label, pct: Math.round((d.correct / d.seen) * 100) }));

        if (played.length < 2) {
            host.innerHTML = '<div class="empty-note">Play on two different days and your ' +
                "accuracy trend appears here.</div>";
            if (table) table.innerHTML = "";
            return;
        }

        const W = 100, H = 46, top = 6, bottom = H - 10;
        const step = played.length > 1 ? W / (played.length - 1) : W;
        const y = p => bottom - (p / 100) * (bottom - top);

        const points = played.map((d, i) => [i * step, y(d.pct)]);
        const path = points.map((p, i) =>
            (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" ");

        // Markers are ≥8px on screen at this scale and carry a 2px surface ring so
        // they stay separate where the line doubles back on itself.
        const dots = points.map((p, i) =>
            '<circle class="dot" cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) +
            '" r="1.5"><title>' + played[i].key + ": " + played[i].pct + "%</title></circle>").join("");

        const last = played[played.length - 1];
        const first = played[0];
        const trend = last.pct - first.pct;

        host.innerHTML =
            '<svg viewBox="0 0 ' + W + " " + H + '" class="chart" role="img" ' +
            'aria-label="Accuracy percentage across the days you played">' +
                '<line class="grid" x1="0" y1="' + y(50).toFixed(2) + '" x2="' + W +
                    '" y2="' + y(50).toFixed(2) + '"/>' +
                '<text class="tick" x="0" y="' + (y(50) - 1.5).toFixed(2) + '">50%</text>' +
                '<path class="line" d="' + path + '"/>' + dots +
                '<text class="tick" x="' + W + '" y="' + (y(last.pct) - 3).toFixed(2) +
                    '" text-anchor="end">' + last.pct + "%</text>" +
            "</svg>" +
            '<p class="chart-note">' +
                (trend > 0 ? "Up " + trend : trend < 0 ? "Down " + Math.abs(trend) : "Level") +
                (trend ? " points" : "") + " since " + first.key + "</p>";

        if (table) {
            table.innerHTML = '<table><thead><tr><th>Date</th><th>Accuracy</th></tr></thead><tbody>' +
                played.map(d => "<tr><td>" + d.key + "</td><td>" + d.pct + "%</td></tr>").join("") +
                "</tbody></table>";
        }
    }

    function renderBests() {
        const host = document.getElementById("bests-grid");
        if (!host) return;
        const speed = typeof getBest === "function" ? getBest("speed-run") : 0;
        const boss = typeof getBest === "function" ? getBest("boss-battle") : 0;
        const player = typeof getPlayerData === "function" ? getPlayerData() : {};

        host.innerHTML =
            tile("i-timer", speed, "Speed Run best") +
            tile("i-ghost", boss, "Boss damage best") +
            tile("i-flame", player.bestComboEver || 0, "Best combo") +
            tile("i-gamepad", player.gamesPlayed || 0, "Games played");
    }

    function tile(icon, value, label) {
        return '<div class="stat-tile"><span class="profile-stat-icon">' + svg(icon) + "</span>" +
            "<strong>" + escapeHTML(value) + "</strong><small>" + escapeHTML(label) + "</small></div>";
    }


    /* =====================================================
       HOME — daily goal + review badge
    ===================================================== */

    function refreshHome() {
        const stats = getStats();
        const done = dayRow(stats.days[todayKey()]).seen;
        const percent = Math.min(100, Math.round((done / DAILY_GOAL) * 100));

        const ring = document.getElementById("goal-ring");
        const count = document.getElementById("goal-count");
        const title = document.getElementById("goal-title");
        const text = document.getElementById("goal-text");

        if (ring) {
            ring.style.setProperty("--pct", percent);
            ring.classList.toggle("done", done >= DAILY_GOAL);
            ring.setAttribute("aria-label",
                "Daily goal: " + done + " of " + DAILY_GOAL + " questions answered today");
        }
        if (count) count.textContent = Math.min(done, DAILY_GOAL) + "/" + DAILY_GOAL;

        if (title && text) {
            if (done >= DAILY_GOAL) {
                title.textContent = "Daily goal smashed";
                text.textContent = "That's " + done + " questions today. Anything else is a bonus.";
            } else if (done > 0) {
                title.textContent = (DAILY_GOAL - done) + " questions to go";
                text.textContent = "You've done " + done + " today. Nearly there.";
            } else {
                title.textContent = "Answer " + DAILY_GOAL + " questions today";
                text.textContent = "You haven't started today. One game gets you most of the way.";
            }
        }

        const badge = document.getElementById("mistake-count-badge");
        if (badge) {
            const n = getMistakes().length;
            badge.textContent = n ? " · " + n : "";
            badge.style.color = "var(--coral)";
        }
    }


    /* =====================================================
       LEVEL UP
       =====================================================

       app.js already detected a level gain and threw up a small popup
       that faded on a timer. This replaces it with something that
       actually reads as a reward: the number counts up, the XP bar
       fills from where it was to where it now is, and it waits for
       you rather than vanishing while you are still reading it.

       It is also announced to screen readers and dismissible with
       Escape — a modal that traps you until a timer expires is a
       modal that has gone wrong.
    ===================================================== */

    function levelBounds(level) {
        // MUST match getLevelFromXP in app.js exactly, which multiplies the
        // requirement by 1.2 each level — it is NOT a flat +250, which is what
        // this used to assume. The two agreed at level 2 and drifted from level 3
        // on, so the level-up bar quietly showed the wrong progress for anyone
        // past their second level. Found by comparing the curves side by side.
        let need = 500, total = 0;
        for (let l = 1; l < level; l++) { total += need; need = Math.round(need * 1.2); }
        return { start: total, need: need };
    }

    window.showLevelUp = function (level) {
        const existing = document.querySelector(".level-up-popup");
        if (existing) existing.remove();

        const popup = document.createElement("div");
        popup.className = "level-up-popup";
        popup.setAttribute("role", "alertdialog");
        popup.setAttribute("aria-live", "assertive");
        popup.setAttribute("aria-label", "Level up. You reached level " + level);

        popup.innerHTML =
            '<div class="level-up-content">' +
                '<div class="level-up-burst" aria-hidden="true">' +
                    new Array(10).fill(0).map((_, i) =>
                        '<i style="--a:' + (i * 36) + 'deg"></i>').join("") +
                "</div>" +
                '<div class="level-up-stars" aria-hidden="true">' +
                    svg("i-star", "icon-fill") + "</div>" +
                '<div class="level-up-label">Level up!</div>' +
                '<div class="level-up-number" id="level-up-number">' + level + "</div>" +
                '<div class="level-up-bar"><div class="level-up-bar-fill" id="level-up-fill"></div></div>' +
                '<div class="level-up-message" id="level-up-message"></div>' +
                '<button class="main-button" id="level-up-close">Keep going</button>' +
            "</div>";

        document.body.appendChild(popup);

        const numberEl = popup.querySelector("#level-up-number");
        const fill = popup.querySelector("#level-up-fill");
        const msg = popup.querySelector("#level-up-message");
        const close = popup.querySelector("#level-up-close");

        const totalXP = Number(localStorage.getItem("reviseGoXP")) || 0;
        const bounds = levelBounds(level);
        const into = Math.max(0, totalXP - bounds.start);
        const pctInto = Math.min(100, Math.round((into / bounds.need) * 100));

        msg.textContent = into + " / " + bounds.need + " XP towards level " + (level + 1);

        const reduced = window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (reduced) {
            // Still shows the same information — it just arrives instead of moving.
            fill.style.width = pctInto + "%";
        } else {
            // Count the number up from the previous level, and fill the bar from
            // empty, on the next frame so the browser has a start value to animate
            // FROM. Setting both in the same frame animates nothing at all.
            numberEl.textContent = Math.max(1, level - 1);
            fill.style.width = "0%";
            requestAnimationFrame(() => requestAnimationFrame(() => {
                numberEl.textContent = level;
                numberEl.classList.add("bump");
                fill.style.width = pctInto + "%";
            }));
        }

        function dismiss() {
            popup.classList.add("closing");
            setTimeout(() => popup.remove(), 200);
            document.removeEventListener("keydown", onKey);
        }

        function onKey(e) {
            if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); dismiss(); }
        }

        close.addEventListener("click", dismiss);
        popup.addEventListener("click", e => { if (e.target === popup) dismiss(); });
        document.addEventListener("keydown", onKey);
        close.focus();

        refreshHome();
    };


    /* =====================================================
       END-OF-GAME XP REWARDS
       =====================================================

       Per-question XP alone made a 10/10 round feel the same as a
       6/10 one — you got a bit more, and nothing said so. These are
       the bonuses worth actually chasing, shown as a breakdown so the
       number on screen is explainable rather than mysterious.
    ===================================================== */

    function awardEndOfGameBonus() {
        const total = TOTAL_QUESTIONS;
        const accuracy = Math.round((correctAnswers / total) * 100);
        const rows = [];

        if (correctAnswers === total) {
            rows.push(["Perfect round", 250]);
        } else if (accuracy >= 80) {
            rows.push(["80%+ accuracy", 120]);
        } else if (accuracy >= 50) {
            rows.push(["Half marks or better", 50]);
        }

        if (lives === 3 && correctAnswers < total) rows.push(["No lives lost", 75]);
        if (bestCombo >= 10) rows.push(["Combo of " + bestCombo, 100]);
        else if (bestCombo >= 5) rows.push(["Combo of " + bestCombo, 40]);

        // Finishing at all is worth something. Turning up is most of revision.
        rows.push(["Round complete", 25]);

        const bonus = rows.reduce((n, r) => n + r[1], 0);

        if (bonus > 0 && typeof saveXP === "function") {
            const before = Number(localStorage.getItem("reviseGoXP")) || 0;
            saveXP(bonus);
            const after = Number(localStorage.getItem("reviseGoXP")) || 0;
            // saveXP does not itself check for a level gain, so a bonus that
            // pushes you over the line has to be checked here or the level-up
            // would not appear until the next question you answered.
            if (typeof checkForLevelUp === "function") checkForLevelUp(before, after);
            if (typeof updateLevelDisplay === "function") updateLevelDisplay();
        }

        return { rows: rows, bonus: bonus };
    }

    function renderXPBreakdown(result) {
        const host = document.getElementById("xp-breakdown");
        if (!host) return;

        host.innerHTML =
            '<div class="xp-breakdown">' +
                '<div class="xp-breakdown-head">' +
                    "<span>Bonus XP</span><strong>+" + result.bonus + "</strong>" +
                "</div>" +
                result.rows.map(r =>
                    '<div class="xp-row"><span>' + escapeHTML(r[0]) + "</span>" +
                    "<strong>+" + r[1] + "</strong></div>").join("") +
            "</div>";
    }


    /* =====================================================
       PROFILES — the "account" UI
    ===================================================== */

    function renderProfileBar() {
        const host = document.getElementById("profile-switcher");
        if (!host || !window.Profiles) return;

        const all = Profiles.list();
        const active = Profiles.activeId();

        host.innerHTML =
            all.map(p =>
                '<button class="profile-chip' + (p.id === active ? " on" : "") + '"' +
                ' data-id="' + p.id + '"' +
                (p.id === active ? ' aria-current="true"' : "") + ">" +
                svg("i-user") + escapeHTML(p.name) + "</button>"
            ).join("") +
            (all.length < 6
                ? '<button class="profile-chip add" id="add-profile">+ New player</button>'
                : "");

        host.querySelectorAll(".profile-chip[data-id]").forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.dataset.id === Profiles.activeId()) return;
                Profiles.switchTo(btn.dataset.id);
                // Everything downstream reads localStorage, which now points at a
                // different save — so the page is reloaded rather than trying to
                // hand-refresh every number app.js has already rendered.
                location.reload();
            });
        });

        const add = host.querySelector("#add-profile");
        if (add) {
            add.addEventListener("click", () => {
                UI.prompt({
                    title: "New player",
                    label: "What should we call them?",
                    placeholder: "e.g. Daniel",
                    maxlength: 20,
                    confirm: "Create"
                }).then(name => {
                    if (!name) return;
                    if (!Profiles.create(name)) {
                        UI.bad("You can have up to 6 players on one device.");
                        return;
                    }
                    const created = Profiles.list().slice(-1)[0];
                    Profiles.switchTo(created.id);
                    location.reload();
                });
            });
        }

        const nameEl = document.getElementById("profile-name");
        if (nameEl) nameEl.textContent = Profiles.name();

        renderAvatar();
        renderSince();
        wireProfileActions();

        const del = document.getElementById("delete-profile");
        if (del) {
            del.style.display = Profiles.list().length > 1 ? "" : "none";
            del.onclick = function () {
                const p = Profiles.active();
                if (!p) return;
                UI.confirm({
                    title: 'Delete "' + p.name + '"?',
                    body: "Their XP, level and review list go with them. This cannot be undone.",
                    confirm: "Delete player",
                    danger: true
                }).then(yes => {
                    if (!yes) return;
                    Profiles.remove(p.id);
                    location.reload();
                });
            };
        }
    }


    const AVATARS = [
        { id: "cyan", from: "#22D3EE", to: "#0E9EB8" },
        { id: "gold", from: "#FFC53D", to: "#FF6B4A" },
        { id: "green", from: "#3DDC84", to: "#0E9EB8" },
        { id: "coral", from: "#FF6B4A", to: "#FF5C7A" },
        { id: "sky", from: "#7DD3FC", to: "#2563EB" },
        { id: "mint", from: "#A7F3D0", to: "#3DDC84" }
    ];

    const AVATAR_KEY = "reviseGoAvatar";

    function currentAvatar() {
        const id = localStorage.getItem(AVATAR_KEY);
        return AVATARS.filter(a => a.id === id)[0] || AVATARS[0];
    }

    function renderAvatar() {
        const av = currentAvatar();
        const el = document.getElementById("profile-avatar");
        if (el) el.style.background = "linear-gradient(150deg," + av.from + "," + av.to + ")";

        const picker = document.getElementById("avatar-picker");
        if (!picker) return;

        picker.innerHTML = AVATARS.map(a =>
            '<button class="avatar-dot' + (a.id === av.id ? " on" : "") + '"' +
            ' role="radio" aria-checked="' + (a.id === av.id) + '"' +
            ' aria-label="' + a.id + ' avatar" data-av="' + a.id + '"' +
            ' style="background:linear-gradient(150deg,' + a.from + "," + a.to + ')"></button>'
        ).join("");

        picker.querySelectorAll(".avatar-dot").forEach(b => {
            b.addEventListener("click", () => {
                localStorage.setItem(AVATAR_KEY, b.dataset.av);
                renderAvatar();
            });
        });
    }

    function renderSince() {
        const el = document.getElementById("profile-since");
        if (!el || !window.Profiles) return;
        const p = Profiles.active();
        if (!p || !p.created) return;
        const days = Math.max(1, Math.round((Date.now() - p.created) / 86400000));
        el.textContent = "Playing for " + days + (days === 1 ? " day" : " days") +
            " · " + (Number(localStorage.getItem("reviseGoXP")) || 0) + " XP earned";
    }

    /* Export / import.
       With no server, the browser's storage IS the save file — and clearing site
       data wipes it with no warning and no way back. A one-click export is the
       difference between "I lost everything" and "I restored it". */
    function wireProfileActions() {
        const rename = document.getElementById("rename-profile");
        if (rename) {
            rename.onclick = function () {
                const p = Profiles.active();
                UI.prompt({
                    title: "Rename player",
                    label: "New name",
                    value: p ? p.name : "",
                    maxlength: 20
                }).then(next => {
                    if (next && Profiles.rename(p.id, next)) {
                        renderProfileBar();
                        UI.ok("Renamed to " + next + ".");
                    }
                });
            };
        }

        const exp = document.getElementById("export-save");
        if (exp) {
            exp.onclick = function () {
                const payload = {
                    app: "ReviseGo",
                    version: 1,
                    exported: new Date().toISOString(),
                    profile: Profiles.active(),
                    data: {
                        xp: localStorage.getItem("reviseGoXP"),
                        player: localStorage.getItem("reviseGoPlayer"),
                        mistakes: localStorage.getItem("reviseGoMistakes"),
                        stats: localStorage.getItem("reviseGoStats"),
                        bests: localStorage.getItem("reviseGoBests"),
                        avatar: localStorage.getItem(AVATAR_KEY)
                    }
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)],
                    { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "revisego-save-" +
                    new Date().toISOString().slice(0, 10) + ".json";
                a.click();
                URL.revokeObjectURL(a.href);
            };
        }

        const imp = document.getElementById("import-save");
        const file = document.getElementById("import-file");
        if (imp && file) {
            imp.onclick = () => file.click();
            file.onchange = function () {
                const f = file.files && file.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = function () {
                    let payload;
                    try {
                        payload = JSON.parse(reader.result);
                    } catch (e) {
                        UI.bad("That file isn't a ReviseGo save.");
                        return;
                    }
                    if (!payload || payload.app !== "ReviseGo" || !payload.data) {
                        UI.bad("That file isn't a ReviseGo save.");
                        return;
                    }
                    // Overwriting a save is not undoable, so it asks first and says
                    // exactly whose progress is about to be replaced.
                    UI.confirm({
                        title: "Import into " + Profiles.name() + "?",
                        body: "Their current XP, level and review list will be replaced. " +
                              "This cannot be undone.",
                        confirm: "Import",
                        danger: true
                    }).then(yes => {
                        if (!yes) return;
                        const d = payload.data;
                        const map = {
                            reviseGoXP: d.xp,
                            reviseGoPlayer: d.player,
                            reviseGoMistakes: d.mistakes,
                            reviseGoStats: d.stats,
                            reviseGoBests: d.bests
                        };
                        Object.keys(map).forEach(k => {
                            if (map[k] != null) localStorage.setItem(k, map[k]);
                        });
                        if (d.avatar) localStorage.setItem(AVATAR_KEY, d.avatar);
                        location.reload();
                    });
                };
                reader.readAsText(f);
            };
        }
    }


    /* =====================================================
       ACHIEVEMENTS — with progress, not just locked/unlocked
    ===================================================== */

    const ACHIEVEMENT_TARGETS = {
        first_win: { label: "Play your first game", target: 1, of: p => p.gamesPlayed || 0 },
        combo_10: { label: "Hit a 10 combo", target: 10, of: p => p.bestComboEver || 0 },
        games_25: { label: "Play 25 games", target: 25, of: p => p.gamesPlayed || 0 },
        questions_100: { label: "Answer 100 questions", target: 100, of: p => p.questionsAnswered || 0 },
        streak_7: { label: "Revise 7 days running", target: 7, of: p => p.streak || 0 }
    };

    function renderAchievementProgress() {
        const host = document.getElementById("profile-achievements");
        if (!host || typeof achievements === "undefined") return;

        const player = getPlayerData();

        host.innerHTML = achievements.map(a => {
            const meta = ACHIEVEMENT_TARGETS[a.id];
            const unlocked = (player.achievements || []).indexOf(a.id) !== -1;
            const have = meta ? Math.min(meta.of(player), meta.target) : (unlocked ? 1 : 0);
            const target = meta ? meta.target : 1;
            const pctDone = Math.round((have / target) * 100);

            return '<div class="achievement-row' + (unlocked ? " done" : "") + '">' +
                '<div class="achievement-mark">' +
                    svg(unlocked ? "i-trophy" : "i-lock") + "</div>" +
                '<div class="achievement-body">' +
                    "<strong>" + escapeHTML(a.name) + "</strong>" +
                    "<small>" + escapeHTML(meta ? meta.label : "") + "</small>" +
                    '<div class="achievement-track">' +
                        '<div class="achievement-fill" style="width:' + pctDone + '%"></div>' +
                    "</div>" +
                "</div>" +
                '<span class="achievement-count">' + have + "/" + target + "</span>" +
            "</div>";
        }).join("");
    }


    /* =====================================================
       GAME LOCKS
    ===================================================== */

    function renderGameLocks() {
        if (!window.GAMES) return;

        GAMES.forEach(game => {
            const card = document.querySelector('[data-game="' + game.id + '"]');
            if (!card) return;

            const state = gameLockState(game);
            const tag = card.querySelector(".game-tag");
            const lock = card.querySelector(".lock");

            card.classList.toggle("locked", state.locked);

            if (tag) {
                tag.textContent = state.locked
                    ? state.message
                    : (game.requiresPremium ? "Unlocked" : "Quick play");
            }

            if (lock) lock.style.display = state.locked ? "" : "none";

            // The label has to say WHY it is locked, or a locked card is just a
            // dead button. Level gates and paywalls need different actions.
            card.setAttribute("aria-label",
                game.name + (state.locked ? " — " + state.message : " — available"));
        });
    }


    /* =====================================================
       PREMIUM SCREEN
    ===================================================== */

    function renderPremium() {
        const payBtn = document.getElementById("pay-button");
        const codeBox = document.getElementById("code-box");
        const status = document.getElementById("premium-status");
        if (!window.Premium) return;

        const unlocked = Premium.isUnlocked();

        if (status) {
            status.textContent = unlocked
                ? "Premium is active on this device."
                : "";
        }

        if (codeBox) codeBox.style.display = unlocked ? "none" : "";

        if (payBtn) {
            payBtn.style.display = unlocked ? "none" : "";
            payBtn.onclick = function () {
                if (!Premium.paymentLink) {
                    // Says what is actually true rather than opening a broken tab.
                    UI.note({
                        title: "Payment isn't connected yet",
                        body: "Add a Stripe Payment Link to PAYMENT_LINK in profile.js and " +
                              "this button will open checkout."
                    });
                    return;
                }
                window.open(Premium.paymentLink, "_blank", "noopener");
            };
        }

        const redeem = document.getElementById("redeem-button");
        const input = document.getElementById("code-input");
        const note = document.getElementById("code-note");

        if (redeem && input) {
            redeem.onclick = function () {
                const result = Premium.redeem(input.value);
                if (note) {
                    note.textContent = result.message;
                    note.className = "code-note " + (result.ok ? "ok" : "bad");
                }
                if (result.ok) {
                    input.value = "";
                    renderPremium();
                    renderGameLocks();
                    if (typeof updatePremiumScreen === "function") updatePremiumScreen();
                    UI.ok(result.message);
                } else {
                    UI.bad(result.message);
                }
            };
            input.addEventListener("keydown", e => {
                if (e.key === "Enter") { e.preventDefault(); redeem.click(); }
            });
        }
    }


    /* =====================================================
       BOOT
    ===================================================== */

    function init() {
        refreshHome();
        renderLives();
        labelAnswerKeys();
        renderProfileBar();
        renderGameLocks();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Shared with modes.js (Speed Run / Boss Battle), which run their own loop but
    // must feed the same review list and stats — otherwise a mistake made in Speed
    // Run would never reach the page whose whole job is collecting mistakes.
    window.ReviseGo = {
        recordAttempt: recordAttempt,
        getStats: getStats,
        getMistakes: getMistakes,
        escapeHTML: escapeHTML,
        svg: svg,
        refreshHome: refreshHome,
        renderGameLocks: renderGameLocks,
        mistakeCard: mistakeCard,
        todayKey: todayKey
    };

    // Returning to the arcade should show the numbers as they are NOW, not as
    // they were when the page loaded.
    const _showScreen = window.showScreen;
    window.showScreen = function (id) {
        const out = _showScreen.apply(this, arguments);
        if (id === "home-screen") { refreshHome(); renderGameLocks(); }
        if (id === "premium-screen") renderPremium();
        if (id === "profile-screen") { renderProfileBar(); renderAchievementProgress(); }
        return out;
    };

})();
