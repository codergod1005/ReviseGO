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

        stats.days[todayKey()] = (stats.days[todayKey()] || 0) + 1;
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
        renderResultMistakes();
        refreshHome();
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

    function tile(icon, value, label) {
        return '<div class="stat-tile"><span class="profile-stat-icon">' + svg(icon) + "</span>" +
            "<strong>" + escapeHTML(value) + "</strong><small>" + escapeHTML(label) + "</small></div>";
    }


    /* =====================================================
       HOME — daily goal + review badge
    ===================================================== */

    function refreshHome() {
        const stats = getStats();
        const done = stats.days[todayKey()] || 0;
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
       BOOT
    ===================================================== */

    function init() {
        refreshHome();
        renderLives();
        labelAnswerKeys();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Returning to the arcade should show the numbers as they are NOW, not as
    // they were when the page loaded.
    const _showScreen = window.showScreen;
    window.showScreen = function (id) {
        const out = _showScreen.apply(this, arguments);
        if (id === "home-screen") refreshHome();
        return out;
    };

})();
