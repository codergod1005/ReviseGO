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
                UI.confirm({
                    title: "Sign out?",
                    body: "Your progress stays saved on this device.",
                    confirm: "Sign out"
                }).then(yes => {
                    if (!yes) return;
                    Accounts.signOut();
                    location.reload();
                });
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
        if (card) card.value = Friends.requestCode();

        const code = $("my-friend-code");
        if (code) code.textContent = Accounts.myCode() || "------";

        renderRequests();

        const board = $("friends-board");
        if (!board) return;

        const rows = Friends.leaderboard();

        if (rows.length <= 1) {
            board.innerHTML = '<div class="empty-note">No friends yet. Send someone your ' +
                "request code — they accept and send one back.</div>";
            return;
        }

        board.innerHTML = rows.map((r, i) => {
            const days = r.at ? Math.round((Date.now() - r.at) / 86400000) : 0;
            const fresh = r.me ? "you"
                : days < 1 ? "updated today"
                : days === 1 ? "1 day old" : days + " days old";
            return '<div class="board-row' + (r.me ? " me" : "") + '">' +
                '<span class="board-rank">' + (i + 1) + "</span>" +
                '<span class="board-name"><strong>' + esc(r.name) +
                    (r.favourite ? ' <span class="fav-mark" title="Favourite">' +
                        icon("i-star", "icon-fill") + "</span>" : "") + "</strong>" +
                    '<small>Level ' + (r.level || 1) + " · " + fresh + "</small></span>" +
                '<span class="board-xp">' + (r.xp || 0).toLocaleString() + " XP</span>" +
                (r.me ? "" :
                    '<span class="board-tools">' +
                        '<button class="board-icon' + (r.favourite ? " on" : "") +
                            '" data-fav="' + esc(r.code) + '" aria-label="Favourite ' +
                            esc(r.name) + '">' + icon("i-star", r.favourite ? "icon-fill" : "") + "</button>" +
                        '<button class="board-icon" data-challenge="' + esc(r.name) +
                            '" aria-label="Challenge ' + esc(r.name) + '">' + icon("i-bolt") + "</button>" +
                        '<button class="board-icon danger" data-remove="' + esc(r.code) +
                            '" aria-label="Remove ' + esc(r.name) + '">' + icon("i-x") + "</button>" +
                    "</span>") +
            "</div>";
        }).join("");

        board.querySelectorAll("[data-remove]").forEach(b => {
            b.addEventListener("click", () => {
                UI.confirm({
                    title: "Remove this friend?",
                    body: "They stay on your leaderboard until you both re-add each other.",
                    confirm: "Remove",
                    danger: true
                }).then(yes => {
                    if (!yes) return;
                    Friends.remove(b.dataset.remove);
                    renderFriends();
                    refreshBadges();
                });
            });
        });

        board.querySelectorAll("[data-fav]").forEach(b => {
            b.addEventListener("click", () => {
                const on = Friends.toggleFavourite(b.dataset.fav);
                renderFriends();
                UI.info(on ? "Pinned to the top of your leaderboard." : "Unpinned.");
            });
        });

        // Challenging creates a room and hands you the code. Same seeded questions
        // for both of you, which is the only way the comparison means anything.
        board.querySelectorAll("[data-challenge]").forEach(b => {
            b.addEventListener("click", () => {
                const name = b.dataset.challenge;
                const room = Rooms.create("You vs " + name, "");
                Notify.push("challenge", { name: "You", room: room.code });
                UI.note({
                    title: "Room " + room.code + " created",
                    body: "Send " + name + " that code. You both get the same ten questions, " +
                          "then swap result codes to see who won."
                });
                refreshBadges();
            });
        });
    }

    function renderRequests() {
        const host = $("friend-requests");
        if (!host || !window.Friends) return;

        const incoming = Friends.incoming();
        const outgoing = Friends.outgoing();

        if (!incoming.length && !outgoing.length) {
            host.innerHTML = "";
            return;
        }

        host.innerHTML =
            '<div class="section-heading"><div><p class="small-heading">Requests</p>' +
            "<h2>Waiting on you</h2></div></div>" +

            incoming.map(r =>
                '<div class="request-row">' +
                    '<span class="board-name"><strong>' + esc(r.name) + "</strong>" +
                        "<small>wants to be friends · level " + (r.level || 1) + "</small></span>" +
                    '<span class="request-tools">' +
                        '<button class="secondary-button small" data-accept="' + r.id +
                            '">Accept</button>' +
                        '<button class="board-icon danger" data-decline="' + r.id +
                            '" aria-label="Decline ' + esc(r.name) + '">' + icon("i-x") + "</button>" +
                    "</span>" +
                "</div>").join("") +

            outgoing.map(r =>
                '<div class="request-row out">' +
                    '<span class="board-name"><strong>' + esc(r.name) + "</strong>" +
                        "<small>request sent — waiting for their accept code</small></span>" +
                    '<button class="board-icon danger" data-cancel="' + r.id +
                        '" aria-label="Cancel request">' + icon("i-x") + "</button>" +
                "</div>").join("");

        host.querySelectorAll("[data-accept]").forEach(b => {
            b.addEventListener("click", () => {
                const result = Friends.accept(b.dataset.accept);
                if (!result.ok) { UI.bad(result.message); return; }
                renderFriends();
                refreshBadges();
                // Accepting is only half the handshake: they still need this code
                // back, or the link stays one-way. So it is put in front of them
                // rather than mentioned in a toast that disappears.
                showAcceptCode(result.name, result.code);
            });
        });

        host.querySelectorAll("[data-decline]").forEach(b => {
            b.addEventListener("click", () => {
                Friends.decline(b.dataset.decline);
                renderFriends();
                refreshBadges();
                UI.info("Request declined.");
            });
        });

        host.querySelectorAll("[data-cancel]").forEach(b => {
            b.addEventListener("click", () => {
                Friends.decline(b.dataset.cancel);
                renderFriends();
                UI.info("Request cancelled.");
            });
        });
    }

    function showAcceptCode(name, code) {
        const box = $("accept-code-box");
        if (!box) return;
        box.hidden = false;
        box.querySelector("strong").textContent = "Send this back to " + name;
        box.querySelector("textarea").value = code;
        box.scrollIntoView({ behavior: "smooth", block: "center" });
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
                if (ok) UI.ok("Card copied. Send it to your friend.");
                setTimeout(() => { copy.textContent = "Copy my card"; }, 1800);
            });
        }

        const add = $("add-friend");
        if (add) {
            add.addEventListener("click", function () {
                const note = $("friend-note");
                const result = Friends.receive($("friend-card").value);
                note.textContent = result.message;
                note.className = "code-note " + (result.ok ? "ok" : "bad");
                if (result.ok) {
                    $("friend-card").value = "";
                    renderFriends();
                    refreshBadges();
                    UI.ok(result.message);
                } else {
                    UI.bad(result.message);
                }
            });
        }

        // "I've sent it" records the outgoing request so it shows as pending,
        // rather than the user having to remember who they messaged.
        const sent = $("mark-sent");
        if (sent) {
            sent.addEventListener("click", function () {
                UI.prompt({
                    title: "Who did you send it to?",
                    label: "Their name",
                    placeholder: "e.g. Daniel",
                    maxlength: 20,
                    confirm: "Mark as sent"
                }).then(name => {
                    if (!name) return;
                    Friends.markSent(name);
                    renderFriends();
                    UI.ok("Waiting on " + name + " to accept.");
                });
            });
        }

        const copyAccept = $("copy-accept");
        if (copyAccept) {
            copyAccept.addEventListener("click", function () {
                const ta = $("accept-code-box").querySelector("textarea");
                ta.select();
                try { document.execCommand("copy"); } catch (e) {}
                if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => {});
                UI.ok("Copied. Send it back to them.");
            });
        }
    }


    /* =====================================================
       NOTIFICATIONS — the bell
    ===================================================== */

    function renderBell() {
        const bell = $("notify-bell");
        const dot = $("notify-count");
        if (!bell || !window.Notify) return;

        const n = Notify.unread();
        if (dot) {
            dot.textContent = n > 9 ? "9+" : String(n);
            dot.hidden = n === 0;
        }
        bell.setAttribute("aria-label",
            n ? n + " unread notification" + (n === 1 ? "" : "s") : "Notifications");
    }

    function renderNotifications() {
        const host = $("notify-list");
        if (!host || !window.Notify) return;

        const all = Notify.list();

        if (!all.length) {
            host.innerHTML = '<div class="empty-note">Nothing yet. Friend requests, ' +
                "challenges and room results turn up here.</div>";
            return;
        }

        host.innerHTML = all.map(n => {
            const mins = Math.round((Date.now() - n.at) / 60000);
            const when = mins < 1 ? "just now"
                : mins < 60 ? mins + " min ago"
                : mins < 1440 ? Math.round(mins / 60) + "h ago"
                : Math.round(mins / 1440) + "d ago";
            return '<div class="notify-row' + (n.read ? "" : " unread") + '">' +
                '<span class="notify-icon">' + icon(Notify.iconFor(n)) + "</span>" +
                '<span class="board-name"><strong>' + esc(Notify.describe(n)) + "</strong>" +
                    "<small>" + when + "</small></span>" +
            "</div>";
        }).join("");
    }

    window.openNotifications = function () {
        renderNotifications();
        showScreen("notify-screen");
        // Marked read on OPEN, not on render, so the count clears when they have
        // actually been looked at.
        Notify.markAllRead();
        setTimeout(renderBell, 400);
    };


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
                UI.confirm({
                    title: "Leave this room?",
                    body: "The results you've collected go with it.",
                    confirm: "Leave",
                    danger: true
                }).then(yes => {
                    if (!yes) return;
                    Rooms.leave(b.dataset.leave);
                    renderRooms();
                    refreshBadges();
                });
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
        if (!set.length) { UI.bad("No questions available for this room."); return; }

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
        renderBell();
    }

    const _showScreen = window.showScreen;
    window.showScreen = function (id) {
        const out = _showScreen.apply(this, arguments);
        if (id === "friends-screen") renderFriends();
        if (id === "rooms-screen") renderRooms();
        if (id === "notify-screen") renderNotifications();
        if (id === "home-screen") { refreshBadges(); renderBell(); }
        return out;
    };

    function wireNotifications() {
        const clear = $("clear-notifications");
        if (!clear) return;
        clear.addEventListener("click", function () {
            UI.confirm({
                title: "Clear all notifications?",
                confirm: "Clear"
            }).then(yes => {
                if (!yes) return;
                Notify.clear();
                renderNotifications();
                renderBell();
            });
        });
    }

    // Same guard as focus.js: these wire* functions call addEventListener, so a
    // second init would double every handler — one click on "Add friend" would
    // run the whole thing twice.
    let started = false;

    function init() {
        if (started) return;
        started = true;

        wireAuth();
        wireFriends();
        wireRooms();
        wireNotifications();
        setMode("signin");
        refreshGate();
        refreshBadges();
        renderBell();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
