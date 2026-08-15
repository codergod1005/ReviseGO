/* =========================================================
   REVISEGO — PREMIUM GAME MODES
   =========================================================

   Speed Run and Boss Battle used to be `alert("coming next")`.
   Selling access to an alert box is the fastest way to lose a paying
   user, so both are now real modes.

   WHY A SEPARATE ENGINE RATHER THAN REUSING app.js's LOOP.
   app.js's answerQuestion is welded to its own rules: exactly
   TOTAL_QUESTIONS questions, three lives, and finishGame at the end.
   Speed Run has no fixed question count and no lives; Boss Battle has
   an enemy with its own health. Bending one loop to cover three sets
   of rules would put a flag on every branch and break Quick Battle
   the first time one of them changed. This runs its own loop over its
   own screen, and reuses the parts that genuinely are shared:
   the question bank, the mistake recorder, and the XP store.
========================================================= */

(function () {
    "use strict";

    const API = window.ReviseGo || {};
    const esc = API.escapeHTML || (s => String(s == null ? "" : s));
    const icon = API.svg || (() => "");

    const BEST_KEY = "reviseGoBests";

    let state = null;
    let tick = null;

    function $(id) { return document.getElementById(id); }

    function bests() {
        try {
            const b = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
            return b && typeof b === "object" ? b : {};
        } catch (e) { return {}; }
    }

    function saveBest(mode, value) {
        const all = bests();
        const previous = all[mode] || 0;
        if (value > previous) {
            all[mode] = value;
            try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (e) {}
            return true;                       // beaten — the results screen says so
        }
        return false;
    }

    window.getBest = function (mode) { return bests()[mode] || 0; };


    /* =====================================================
       QUESTION POOLS
    ===================================================== */

    function pool(subject, hard) {
        let list = questions.filter(q => !subject || q.subject === subject);
        if (hard) {
            // Boss Battle wants the difficult ones — but a bank with no Hard
            // questions must still produce a game rather than an empty screen.
            const tough = list.filter(q =>
                q.difficulty === "Hard" || q.difficulty === "Medium");
            if (tough.length >= 5) list = tough;
        }
        return shuffle(list.slice());
    }

    function shuffle(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function nextQuestion() {
        if (!state.queue.length) state.queue = pool(state.subject, state.hard);
        return state.queue.pop();
    }


    /* =====================================================
       MODES
    ===================================================== */

    const MODES = {

        "speed-run": {
            name: "Speed Run",
            blurb: "60 seconds. As many as you can.",
            duration: 60,
            hard: false,
            // Wrong answers cost time rather than ending the run: the mode is
            // about pace, and a sudden-death rule would make the safe play
            // "answer slowly", which is the opposite of the point.
            wrongPenalty: 3,
            rightBonus: 1,
            scoreLabel: "questions"
        },

        "boss-battle": {
            name: "Boss Battle",
            blurb: "Harder questions. Take the boss down before it takes you.",
            duration: 0,
            hard: true,
            bossHP: 100,
            playerHP: 3,
            scoreLabel: "damage"
        }
    };


    /* =====================================================
       START
    ===================================================== */

    window.startMode = function (modeId, subject) {
        const mode = MODES[modeId];
        if (!mode) return;

        const available = pool(subject, mode.hard);
        if (!available.length) {
            UI.bad("There aren't any questions for that subject yet.");
            return;
        }

        state = {
            id: modeId,
            mode: mode,
            subject: subject || "",
            hard: mode.hard,
            queue: available,
            score: 0,
            correct: 0,
            answered: 0,
            combo: 0,
            bestCombo: 0,
            xp: 0,
            timeLeft: mode.duration,
            bossHP: mode.bossHP || 0,
            playerHP: mode.playerHP || 0,
            over: false,
            startedAt: Date.now()
        };

        showScreen("mode-screen");
        $("mode-name").textContent = mode.name;
        $("mode-blurb").textContent = mode.blurb;
        $("mode-screen").dataset.mode = modeId;

        renderHUD();
        loadNext();

        if (mode.duration) {
            clearInterval(tick);
            tick = setInterval(() => {
                if (!state || state.over) return;
                state.timeLeft--;
                renderHUD();
                if (state.timeLeft <= 0) finish("Time!");
            }, 1000);
        }
    };


    /* =====================================================
       HUD
    ===================================================== */

    function renderHUD() {
        const hud = $("mode-hud");
        if (!hud || !state) return;

        const m = state.mode;
        let html = "";

        if (m.duration) {
            const low = state.timeLeft <= 10;
            html +=
                '<div class="hud-cell' + (low ? " urgent" : "") + '" aria-label="Time left">' +
                    icon("i-timer") +
                    "<strong>" + Math.max(0, state.timeLeft) + "</strong><small>seconds</small>" +
                "</div>";
        }

        if (m.bossHP) {
            const pct = Math.max(0, Math.round((state.bossHP / m.bossHP) * 100));
            html +=
                '<div class="hud-boss">' +
                    '<div class="hud-boss-head"><span>Boss</span><span>' + pct + "%</span></div>" +
                    '<div class="hud-boss-track"><div class="hud-boss-fill" style="width:' +
                        pct + '%"></div></div>' +
                "</div>" +
                '<div class="hud-cell" aria-label="Your health">' + icon("i-heart", "icon-fill") +
                    "<strong>" + state.playerHP + "</strong><small>health</small></div>";
        }

        html +=
            '<div class="hud-cell" aria-label="Score">' + icon("i-target") +
                "<strong>" + state.score + "</strong><small>" + m.scoreLabel + "</small></div>" +
            '<div class="hud-cell' + (state.combo >= 3 ? " hot" : "") + '" aria-label="Combo">' +
                icon("i-flame", "icon-fill") +
                "<strong>" + state.combo + "</strong><small>combo</small></div>";

        hud.innerHTML = html;
    }


    /* =====================================================
       QUESTION LOOP
    ===================================================== */

    function loadNext() {
        if (!state || state.over) return;

        const q = nextQuestion();
        state.current = q;

        $("mode-topic").textContent = q.subject + " · " + q.topic;
        $("mode-question").textContent = q.question;
        $("mode-feedback").textContent = "";
        $("mode-feedback").className = "feedback";

        const host = $("mode-answers");
        host.innerHTML = "";

        q.options.forEach((option, i) => {
            const b = document.createElement("button");
            b.className = "answer-button";
            b.setAttribute("data-key", i + 1);
            b.textContent = option;
            b.addEventListener("click", () => answer(i, b));
            host.appendChild(b);
        });
    }

    function answer(index, button) {
        if (!state || state.over || state.locked) return;
        state.locked = true;

        const q = state.current;
        const right = index === q.answer;

        Array.prototype.forEach.call(
            $("mode-answers").children, b => { b.disabled = true; });

        // The same recorder Quick Battle uses, so a Speed Run mistake still lands
        // in the review list and still counts towards the daily goal.
        if (API.recordAttempt) API.recordAttempt(q, index, right);

        state.answered++;

        if (right) {
            button.classList.add("correct");
            state.correct++;
            state.combo++;
            state.bestCombo = Math.max(state.bestCombo, state.combo);

            if (state.mode.duration) {
                state.score++;
                state.timeLeft += state.mode.rightBonus;
                state.xp += 40 + Math.min(60, state.combo * 8);
            }

            if (state.mode.bossHP) {
                // Combo raises the damage, so a run of right answers is visibly
                // worth more than the same answers spread out.
                const damage = 10 + Math.min(15, state.combo * 2);
                state.bossHP = Math.max(0, state.bossHP - damage);
                state.score += damage;
                state.xp += 45 + Math.min(60, state.combo * 8);
            }

            $("mode-feedback").textContent = "Correct. " + (q.explanation || "");
            $("mode-feedback").className = "feedback ok";

        } else {
            button.classList.add("wrong");
            const rightButton = $("mode-answers").children[q.answer];
            if (rightButton) rightButton.classList.add("correct");

            state.combo = 0;

            if (state.mode.duration) state.timeLeft -= state.mode.wrongPenalty;
            if (state.mode.bossHP) state.playerHP--;

            $("mode-feedback").textContent =
                (state.mode.duration ? "-" + state.mode.wrongPenalty + "s. " : "") +
                (q.explanation || "Not quite.");
            $("mode-feedback").className = "feedback bad";
        }

        renderHUD();

        const done =
            (state.mode.bossHP && (state.bossHP <= 0 || state.playerHP <= 0)) ||
            (state.mode.duration && state.timeLeft <= 0);

        setTimeout(() => {
            state.locked = false;
            if (done) {
                finish(state.mode.bossHP
                    ? (state.bossHP <= 0 ? "Boss defeated" : "You were beaten")
                    : "Time!");
            } else if (!state.over) {
                loadNext();
            }
        }, right ? 700 : 1600);
    }


    /* =====================================================
       FINISH
    ===================================================== */

    function finish(headline) {
        if (!state || state.over) return;
        state.over = true;
        clearInterval(tick);

        const accuracy = state.answered
            ? Math.round((state.correct / state.answered) * 100) : 0;

        // Completion bonus, so a good run is worth more than the sum of its answers.
        if (state.mode.bossHP && state.bossHP <= 0) state.xp += 400;
        if (state.mode.duration && state.score >= 15) state.xp += 250;
        else if (state.mode.duration && state.score >= 8) state.xp += 100;

        const beaten = saveBest(state.id, state.score);

        if (typeof saveXP === "function") {
            const before = Number(localStorage.getItem("reviseGoXP")) || 0;
            saveXP(state.xp);
            const after = Number(localStorage.getItem("reviseGoXP")) || 0;
            if (typeof checkForLevelUp === "function") checkForLevelUp(before, after);
            if (typeof updateLevelDisplay === "function") updateLevelDisplay();
        }

        $("mode-result-title").textContent = headline;
        $("mode-result-sub").textContent =
            state.correct + " of " + state.answered + " correct · " + accuracy + "% accuracy";

        $("mode-result-stats").innerHTML =
            stat("i-target", state.score, state.mode.scoreLabel) +
            stat("i-star", state.xp, "XP earned", true) +
            stat("i-flame", state.bestCombo, "best combo", true) +
            stat("i-trophy", window.getBest(state.id), "personal best");

        $("mode-best-note").textContent = beaten
            ? "New personal best."
            : "Personal best: " + window.getBest(state.id) + " " + state.mode.scoreLabel + ".";
        $("mode-best-note").className = "best-note" + (beaten ? " new" : "");

        $("mode-again").onclick = () => window.startMode(state.id, state.subject);

        showScreen("mode-result-screen");
        if (API.refreshHome) API.refreshHome();
        if (API.renderGameLocks) API.renderGameLocks();
    }

    function stat(sym, value, label, fill) {
        return '<div class="result-stat"><span>' + icon(sym, fill ? "icon-fill" : "") +
            "</span><strong>" + esc(value) + "</strong><small>" + esc(label) + "</small></div>";
    }


    /* =====================================================
       QUIT + KEYBOARD
    ===================================================== */

    window.quitMode = function () {
        if (state) state.over = true;
        clearInterval(tick);
        showScreen("home-screen");
    };

    document.addEventListener("keydown", function (e) {
        const screen = $("mode-screen");
        if (!screen || !screen.classList.contains("active")) return;
        if (e.key < "1" || e.key > "4" || e.altKey || e.ctrlKey || e.metaKey) return;
        const b = $("mode-answers").children[Number(e.key) - 1];
        if (b && !b.disabled) { e.preventDefault(); b.click(); }
    });


    /* =====================================================
       ENTRY POINT — replaces app.js's alert stub
    ===================================================== */

    window.startPremiumGame = function (gameName) {
        const id = gameName === "Speed Run" ? "speed-run"
                 : gameName === "Boss Battle" ? "boss-battle" : "";
        if (!id) return;
        window.pendingMode = id;
        showScreen("mode-subject-screen");
        const title = $("mode-subject-title");
        if (title) title.textContent = MODES[id].name;
    };

    window.startModeWithSubject = function (subject) {
        window.startMode(window.pendingMode || "speed-run", subject);
    };

})();
