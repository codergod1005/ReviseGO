/* =========================================================
   REVISEGO — FOCUS TIMER
   =========================================================

   Borrowed from Brainify, which pairs its quiz with a proper study
   timer. A revision app that only does quizzes has nothing to offer
   the hour BEFORE the quiz, which is most of revision.

   25 on / 5 off, the standard pomodoro, with a long break every
   fourth session. Finishing a focus block banks XP, so time spent
   actually revising counts towards the same level as the games —
   otherwise the timer is a separate app that happens to share a tab.

   The countdown is driven from a TIMESTAMP, not by decrementing a
   counter on an interval. Background tabs get their timers throttled
   to once a second at best and often far less, so a counter-based
   timer silently runs slow exactly when someone has switched away to
   read their notes — which is the entire use case.
========================================================= */

(function () {
    "use strict";

    const FOCUS_MIN = 25;
    const BREAK_MIN = 5;
    const LONG_BREAK_MIN = 15;
    const ROUNDS_BEFORE_LONG = 4;

    const STATS_KEY = "reviseGoFocus";
    const XP_PER_SESSION = 150;

    const $ = id => document.getElementById(id);

    let phase = "focus";        // focus | break
    let running = false;
    let endsAt = 0;             // epoch ms
    let remaining = FOCUS_MIN * 60 * 1000;
    let round = 1;
    let tick = null;

    function stats() {
        try {
            const s = JSON.parse(localStorage.getItem(STATS_KEY) || "{}");
            return { sessions: s.sessions || 0, minutes: s.minutes || 0 };
        } catch (e) { return { sessions: 0, minutes: 0 }; }
    }

    function saveStats(s) {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {}
    }

    function phaseLength() {
        if (phase === "focus") return FOCUS_MIN * 60 * 1000;
        return (round % ROUNDS_BEFORE_LONG === 0 ? LONG_BREAK_MIN : BREAK_MIN) * 60 * 1000;
    }

    function msLeft() {
        return running ? Math.max(0, endsAt - Date.now()) : remaining;
    }

    function format(ms) {
        const total = Math.ceil(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    function render() {
        const left = msLeft();
        const full = phaseLength();
        const done = full ? 1 - left / full : 0;

        const time = $("focus-time");
        if (time) time.textContent = format(left);

        const ring = $("focus-ring");
        if (ring) {
            ring.style.setProperty("--pct", Math.round(done * 100));
            ring.classList.toggle("resting", phase === "break");
            ring.setAttribute("aria-label",
                (phase === "focus" ? "Focus" : "Break") + ", " + format(left) + " remaining");
        }

        const label = $("focus-phase");
        if (label) {
            label.textContent = phase === "focus" ? "Focus"
                : (round % ROUNDS_BEFORE_LONG === 0 ? "Long break" : "Break");
        }

        const r = $("focus-round");
        if (r) r.textContent = "Session " + round;

        const toggle = $("focus-toggle");
        if (toggle) {
            toggle.querySelector("span").textContent = running ? "Pause" : "Start";
            toggle.querySelector("use").setAttribute("href", running ? "#i-pause" : "#i-play");
        }

        const grid = $("focus-stats");
        if (grid && window.ReviseGo && ReviseGo.svg) {
            const s = stats();
            const hours = Math.floor(s.minutes / 60);
            grid.innerHTML =
                tile("i-check", s.sessions, "Sessions done") +
                tile("i-timer", hours ? hours + "h " + (s.minutes % 60) + "m" : s.minutes + "m",
                     "Time focused") +
                tile("i-star", (s.sessions * XP_PER_SESSION).toLocaleString(), "XP from focus");
        }
    }

    function tileIcon(id) {
        return '<svg class="icon" aria-hidden="true"><use href="#' + id + '"/></svg>';
    }

    function tile(icon, value, label) {
        return '<div class="stat-tile"><span class="profile-stat-icon">' + tileIcon(icon) +
            "</span><strong>" + value + "</strong><small>" + label + "</small></div>";
    }

    function start() {
        if (running) return;
        running = true;
        endsAt = Date.now() + remaining;
        clearInterval(tick);
        tick = setInterval(() => {
            if (msLeft() <= 0) complete();
            else render();
        }, 250);
        render();
    }

    function pause() {
        if (!running) return;
        remaining = msLeft();
        running = false;
        clearInterval(tick);
        render();
    }

    function reset() {
        running = false;
        clearInterval(tick);
        phase = "focus";
        round = 1;
        remaining = phaseLength();
        render();
    }

    function complete() {
        clearInterval(tick);
        running = false;

        if (phase === "focus") {
            const s = stats();
            s.sessions += 1;
            s.minutes += FOCUS_MIN;
            saveStats(s);

            // Time revising earns towards the same level as the games. A separate
            // currency would make the timer feel like a different app.
            if (typeof saveXP === "function") {
                const before = Number(localStorage.getItem("reviseGoXP")) || 0;
                saveXP(XP_PER_SESSION);
                const after = Number(localStorage.getItem("reviseGoXP")) || 0;
                if (typeof checkForLevelUp === "function") checkForLevelUp(before, after);
                if (typeof updateLevelDisplay === "function") updateLevelDisplay();
            }

            if (window.UI) UI.ok("Session done. +" + XP_PER_SESSION + " XP. Take a break.");
            phase = "break";
        } else {
            if (window.UI) UI.info("Break over. Back to it.");
            phase = "focus";
            round += 1;
        }

        remaining = phaseLength();
        render();
        beep();
    }

    // A short tone rather than an audio file: no asset to load, no request to
    // make, and it works offline. Silently does nothing if the browser blocks
    // audio before a user gesture, which is the correct outcome.
    function beep() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.value = phase === "focus" ? 660 : 440;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
            osc.start();
            osc.stop(ctx.currentTime + 0.62);
            setTimeout(() => ctx.close(), 900);
        } catch (e) { /* audio is a nicety, never a requirement */ }
    }

    window.openFocus = function () {
        render();
        showScreen("focus-screen");
    };

    // Guarded because init ATTACHES LISTENERS, and running it twice attaches them
    // twice — so one press of Start would run start() and then pause(), leaving
    // the timer exactly where it was and looking like a dead button. Easy to hit:
    // a script added while the document is still parsing registers for
    // DOMContentLoaded, and anything that dispatches that event again gets a
    // second init. Caught by the smoke test doing precisely that.
    let started = false;

    function init() {
        if (started) return;
        started = true;

        const toggle = $("focus-toggle");
        if (toggle) toggle.addEventListener("click", () => running ? pause() : start());

        const rst = $("focus-reset");
        if (rst) {
            rst.addEventListener("click", () => {
                if (!running && msLeft() === phaseLength()) { reset(); return; }
                UI.confirm({
                    title: "Reset the timer?",
                    body: "This session's progress is lost.",
                    confirm: "Reset"
                }).then(yes => { if (yes) reset(); });
            });
        }

        remaining = phaseLength();
        render();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.focusStats = stats;

})();
