/* =========================================================
   REVISEGO — AUTH GATE, FRIENDS AND ROOMS (UI)
   =========================================================
   Loads last. accounts.js holds the logic; this wires it to the DOM.
========================================================= */

(function () {
    "use strict";

    const API = window.ReviseGo || {};
    const esc = API.escapeHTML || (s => String(s == null ? "" : s));
    const icon = API.svg || (() => "");

    const $ = id => document.getElementById(id);

    let mode = "signin";


    /* =====================================================
       THE GATE
    ===================================================== */

    function refreshGate() {
        const gate = $("auth-gate");
        if (!gate || !window.Accounts) return;

        const signedIn = Accounts.isSignedIn();
        gate.hidden = signedIn;

        // The app is inert behind the gate, not merely covered. A visually hidden
        // page that still takes Tab focus is a page a keyboard user can play
        // without signing in — and a screen reader would read straight through it.
        document.body.classList.toggle("gated", !signedIn);
        const main = document.querySelector("main");
        const bar = document.querySelector(".top-bar");
        [main, bar].forEach(el => {
            if (!el) return;
            if (signedIn) { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
            else { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); }
        });

        const out = $("sign-out");
        if (out) out.hidden = !signedIn;

        const label = $("topbar-username");
        if (label) label.textContent = signedIn ? Accounts.current().username : "Profile";

        if (!signedIn) {
            const u = $("auth-username");
            if (u) u.focus();
        }
    }

    window.refreshAuthGate = refreshGate;

    function setMode(next) {
        mode = next;
        const inTab = $("tab-signin"), upTab = $("tab-signup");
        const submit = $("auth-submit"), pw = $("auth-password");

        inTab.classList.toggle("on", mode === "signin");
        upTab.classList.toggle("on", mode === "signup");
        inTab.setAttribute("aria-selected", String(mode === "signin"));
        upTab.setAttribute("aria-selected", String(mode === "signup"));

        submit.textContent = mode === "signin" ? "Sign in" : "Create account";
        // Telling the password manager which one this is stops it offering to
        // save an existing password as a new account, and vice versa.
        pw.setAttribute("autocomplete", mode === "signin" ? "current-password" : "new-password");
        $("auth-error").textContent = "";
    }

    function wireAuth() {
        if (!$("auth-form")) return;

        $("tab-signin").addEventListener("click", () => setMode("signin"));
        $("tab-signup").addEventListener("click", () => setMode("signup"));

        $("auth-form").addEventListener("submit", async function (e) {
            e.preventDefault();
            const submit = $("auth-submit");
            const err = $("auth-error");
            const username = $("auth-username").value;
            const password = $("auth-password").value;

            // Hashing 210,000 PBKDF2 rounds takes a beat. Without this the button
            // looks broken and people click it three more times.
            submit.disabled = true;
            submit.textContent = mode === "signin" ? "Signing in..." : "Creating...";
            err.textContent = "";

            let result;
            try {
                result = mode === "signin"
                    ? await Accounts.signIn(username, password)
                    : await Accounts.signUp(username, password);
            } catch (ex) {
                result = { ok: false, message: "Something went wrong: " + ex.message };
            }

            submit.disabled = false;
            setMode(mode);

            if (!result.ok) {
                err.textContent = result.message;
                return;
            }

            $("auth-password").value = "";
            // A fresh sign-in changes which save slot is active, so everything
            // already rendered from the previous one has to be rebuilt.
            location.reload();
        });

        const out = $("sign-out");
        if (out) {
            out.addEventListener("click", function () {
                if (!confirm("Sign out? Your progress stays saved on this device.")) return;
                Accounts.signOut();
                location.reload();
            });
        }
    }


    /* =====================================================
       FRIENDS
    ===================================================== */

    window.openFriends = function () {
        renderFriends();
        showScreen("friends-screen");
    };

    function renderFriends() {
        if (!window.Friends || !window.Accounts) return;

        const card = $("my-card");
        if (card) card.value = Friends.myCard();

        const code = $("my-friend-code");
        if (code) code.textContent = Accounts.myCode() || "------";

        const board = $("friends-board");
        if (!board) return;

        const rows = Friends.leaderboard();

        if (rows.length <= 1) {
            board.innerHTML = '<div class="empty-note">No friends added yet. Send someone ' +
                "your card and paste theirs back to compare.</div>";
        } else {
            board.innerHTML = rows.map((r, i) => {
                const days = r.at ? Math.round((Date.now() - r.at) / 86400000) : 0;
                const fresh = r.me ? "you"
                    : days < 1 ? "updated today"
                    : days === 1 ? "1 day old" : days + " days old";
                return '<div class="board-row' + (r.me ? " me" : "") + '">' +
                    '<span class="board-rank">' + (i + 1) + "</span>" +
                    '<span class="board-name"><strong>' + esc(r.name) + "</strong>" +
                        '<small>Level ' + (r.level || 1) + " · " + fresh + "</small></span>" +
                    '<span class="board-xp">' + (r.xp || 0).toLocaleString() + " XP</span>" +
                    (r.me ? "" :
                        '<button class="board-remove" data-code="' + esc(r.code) +
                        '" aria-label="Remove ' + esc(r.name) + '">' + icon("i-x") + "</button>") +
                "</div>";
            }).join("");

            board.querySelectorAll(".board-remove").forEach(b => {
                b.addEventListener("click", () => {
                    Friends.remove(b.dataset.code);
                    renderFriends();
                    refreshBadges();
                });
            });
        }
    }

    function wireFriends() {
        const copy = $("copy-card");
        if (copy) {
            copy.addEventListener("click", function () {
                const card = $("my-card");
                card.select();
                let ok = false;
                try { ok = document.execCommand("copy"); } catch (e) {}
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(card.value).catch(() => {});
                    ok = true;
                }
                copy.textContent = ok ? "Copied" : "Press Ctrl+C";
                setTimeout(() => { copy.textContent = "Copy my card"; }, 1800);
            });
        }

        const add = $("add-friend");
        if (add) {
            add.addEventListener("click", function () {
                const note = $("friend-note");
                const result = Friends.add($("friend-card").value);
                note.textContent = result.message;
                note.className = "code-note " + (result.ok ? "ok" : "bad");
                if (result.ok) {
                    $("friend-card").value = "";
                    renderFriends();
                    refreshBadges();
                }
            });
        }
    }


    /* =====================================================
       ROOMS
    ===================================================== */

    window.openRooms = function () {
        renderRooms();
        showScreen("rooms-screen");
    };

    function renderRooms() {
        const host = $("room-list");
        if (!host || !window.Rooms) return;

        const rooms = Rooms.list();

        if (!rooms.length) {
            host.innerHTML = '<div class="empty-note">No rooms yet. Create one and send the ' +
                "code to whoever you're revising with.</div>";
            return;
        }

        host.innerHTML = rooms.map(room => {
            const results = (room.results || []).slice()
                .sort((a, b) => (b.score || 0) - (a.score || 0));

            return '<div class="room-card">' +
                '<div class="room-head">' +
                    "<div><strong>" + esc(room.name) + "</strong>" +
                    '<small>Code <b>' + esc(room.code) + "</b>" +
                        (room.subject ? " · " + esc(room.subject) : "") + "</small></div>" +
                    '<div class="room-buttons">' +
                        '<button class="secondary-button small" data-play="' + esc(room.code) +
                            '">Play</button>' +
                        '<button class="danger-button small" data-leave="' + esc(room.code) +
                            '">Leave</button>' +
                    "</div>" +
                "</div>" +
                (results.length
                    ? '<div class="room-board">' + results.map((r, i) =>
                        '<div class="board-row"><span class="board-rank">' + (i + 1) + "</span>" +
                        '<span class="board-name"><strong>' + esc(r.name) + "</strong></span>" +
                        '<span class="board-xp">' + r.score + "/" + r.total + "</span></div>"
                      ).join("") + "</div>"
                    : '<p class="room-empty">Nobody has played yet.</p>') +
                '<div class="room-share">' +
                    '<label for="res-' + esc(room.code) + '">Paste a result code</label>' +
                    '<textarea id="res-' + esc(room.code) + '" rows="2" ' +
                        'placeholder="Paste what they sent you"></textarea>' +
                    '<button class="secondary-button small" data-submit="' + esc(room.code) +
                        '">Add result</button>' +
                    '<p class="code-note" data-note="' + esc(room.code) + '"></p>' +
                "</div>" +
            "</div>";
        }).join("");

        host.querySelectorAll("[data-play]").forEach(b =>
            b.addEventListener("click", () => playRoom(b.dataset.play)));

        host.querySelectorAll("[data-leave]").forEach(b =>
            b.addEventListener("click", () => {
                if (!confirm("Leave this room? The results you've collected go with it.")) return;
                Rooms.leave(b.dataset.leave);
                renderRooms();
                refreshBadges();
            }));

        host.querySelectorAll("[data-submit]").forEach(b =>
            b.addEventListener("click", () => {
                const code = b.dataset.submit;
                const text = $("res-" + code).value;
                const note = host.querySelector('[data-note="' + code + '"]');
                const result = Rooms.submit(text);
                if (note) {
                    note.textContent = result.message;
                    note.className = "code-note " + (result.ok ? "ok" : "bad");
                }
                if (result.ok) setTimeout(renderRooms, 900);
            }));
    }

    // Playing a room reuses Quick Battle's loop with the room's seeded questions,
    // so scores are comparable: same questions, same order, same rules.
    function playRoom(code) {
        const room = Rooms.get(code);
        if (!room) return;

        const set = Rooms.questionsFor(code, room.subject);
        if (!set.length) { alert("No questions available for this room."); return; }

        window.activeRoom = code;

        currentSubject = "Room " + code;
        currentQuestions = set;
        currentQuestion = 0;
        score = 0; xp = 0; lives = 3; combo = 0; bestCombo = 0;
        correctAnswers = 0; questionsPlayed = 0;

        updateGameStats();
        showScreen("game-screen");
        loadQuestion();
    }

    // When a room round ends, record the score and hand over a code to send on.
    const _finishGame = window.finishGame;
    window.finishGame = function () {
        const out = _finishGame.apply(this, arguments);
        const code = window.activeRoom;
        if (code && window.Rooms) {
            Rooms.recordMyResult(code, correctAnswers, 10);
            const host = $("xp-breakdown");
            if (host) {
                host.insertAdjacentHTML("afterbegin",
                    '<div class="room-result">' +
                        "<strong>Room " + esc(code) + " — send this to the others</strong>" +
                        "<textarea readonly rows='2'>" +
                            esc(Rooms.resultCode(code, correctAnswers, 10)) + "</textarea>" +
                    "</div>");
            }
            window.activeRoom = null;
        }
        return out;
    };

    function wireRooms() {
        const create = $("create-room");
        if (create) {
            create.addEventListener("click", function () {
                const room = Rooms.create($("room-name").value || "Study room", "");
                $("room-name").value = "";
                renderRooms();
                refreshBadges();
                const note = $("room-note");
                if (note) {
                    note.textContent = "Room created. Share the code " + room.code + ".";
                    note.className = "code-note ok";
                }
            });
        }

        const join = $("join-room");
        if (join) {
            join.addEventListener("click", function () {
                const note = $("room-note");
                const result = Rooms.join($("join-code").value);
                note.textContent = result.ok
                    ? "Joined " + result.room.code + "." : result.message;
                note.className = "code-note " + (result.ok ? "ok" : "bad");
                if (result.ok) {
                    $("join-code").value = "";
                    renderRooms();
                    refreshBadges();
                }
            });
        }
    }


    /* =====================================================
       BADGES + BOOT
    ===================================================== */

    function refreshBadges() {
        const f = $("friend-count-badge");
        if (f && window.Friends) {
            const n = Friends.list().length;
            f.textContent = n ? " · " + n : "";
            f.style.color = "var(--primary)";
        }
        const r = $("room-count-badge");
        if (r && window.Rooms) {
            const n = Rooms.list().length;
            r.textContent = n ? " · " + n : "";
            r.style.color = "var(--primary)";
        }
    }

    const _showScreen = window.showScreen;
    window.showScreen = function (id) {
        const out = _showScreen.apply(this, arguments);
        if (id === "friends-screen") renderFriends();
        if (id === "rooms-screen") renderRooms();
        if (id === "home-screen") refreshBadges();
        return out;
    };

    function init() {
        wireAuth();
        wireFriends();
        wireRooms();
        setMode("signin");
        refreshGate();
        refreshBadges();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
