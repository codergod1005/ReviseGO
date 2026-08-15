/* =========================================================
   REVISEGO — ACCOUNTS, FRIENDS AND STUDY ROOMS
   =========================================================

   ── READ THIS BEFORE TRUSTING THE PASSWORD ──────────────────────
   THIS IS NOT REAL SECURITY, AND THE APP SAYS SO ON THE SIGN-IN
   SCREEN.

   There is no server. Everything lives in this browser, which means
   anyone who can open this browser's devtools can read the stored
   accounts and delete them. A sign-in here is a "who is playing"
   gate — the thing that stops your brother opening your XP — not a
   lock on private data.

   What it DOES do properly, because doing it badly would be worse
   than not doing it at all:

     • Passwords are never stored. Only a PBKDF2-SHA256 hash with
       210,000 iterations and a random 16-byte salt per account.
     • The salt is per-account, so two people choosing the same
       password get different hashes.
     • Comparison is constant-time-ish over the hash, not the input.

   Why bother hashing at all if it isn't secure? Because people reuse
   passwords. Storing "hunter2" in plain text in localStorage would
   hand over a password that probably opens something that matters.
   Hashing costs nothing and removes that.

   ── FRIENDS AND ROOMS WITHOUT A SERVER ──────────────────────────
   You cannot look someone up if there is nothing to look them up in.
   So friends are added by exchanging a CODE — a compact snapshot of
   a player that they copy to you — and study rooms work the same
   way: a room code seeds the SAME questions for everyone, you each
   play it, and you paste back a result code to build the table.

   It is asynchronous rather than live, which is the honest version
   of multiplayer with no backend. Nothing here pretends a friend is
   online.
========================================================= */

(function () {
    "use strict";

    const ACCOUNTS_KEY = "reviseGoAccounts";
    const SESSION_KEY = "reviseGoSession";
    const FRIENDS_KEY = "reviseGoFriends";
    const ROOMS_KEY = "reviseGoRooms";

    const ITERATIONS = 210000;

    function readJSON(key, fallback) {
        try {
            const v = JSON.parse(localStorage.getItem(key));
            return v == null ? fallback : v;
        } catch (e) { return fallback; }
    }

    function writeJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    function accounts() {
        const a = readJSON(ACCOUNTS_KEY, []);
        return Array.isArray(a) ? a : [];
    }


    /* =====================================================
       PASSWORD HASHING
    ===================================================== */

    const subtle = (typeof crypto !== "undefined" && crypto.subtle) ? crypto.subtle : null;

    function toHex(buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer),
            b => ("00" + b.toString(16)).slice(-2)).join("");
    }

    function randomSalt() {
        const bytes = new Uint8Array(16);
        if (typeof crypto !== "undefined" && crypto.getRandomValues) {
            crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        return toHex(bytes);
    }

    async function hashPassword(password, saltHex) {
        if (!subtle) {
            // WebCrypto is missing (very old browser, or the page is being served
            // over plain http from a non-localhost origin). Refuse rather than
            // silently falling back to something weak — a password that looks
            // protected but isn't is worse than being told it can't be.
            throw new Error("This browser can't hash passwords securely. " +
                            "Open the page over https or localhost.");
        }
        const enc = new TextEncoder();
        const key = await subtle.importKey(
            "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
        const bits = await subtle.deriveBits({
            name: "PBKDF2",
            salt: enc.encode(saltHex),
            iterations: ITERATIONS,
            hash: "SHA-256"
        }, key, 256);
        return toHex(bits);
    }


    /* =====================================================
       ACCOUNTS
    ===================================================== */

    function normalise(name) {
        return String(name || "").trim().toLowerCase();
    }

    function findAccount(username) {
        const u = normalise(username);
        return accounts().filter(a => normalise(a.username) === u)[0] || null;
    }

    function makeFriendCode() {
        // Short, unambiguous, easy to read aloud: no O/0 or I/1.
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let out = "";
        for (let i = 0; i < 6; i++) {
            out += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        return out;
    }

    window.Accounts = {

        list: () => accounts().map(a => ({ username: a.username, created: a.created })),

        current: function () {
            const id = localStorage.getItem(SESSION_KEY);
            if (!id) return null;
            return accounts().filter(a => a.id === id)[0] || null;
        },

        isSignedIn: function () { return !!this.current(); },

        signUp: async function (username, password) {
            const name = String(username || "").trim();

            if (name.length < 3 || name.length > 16) {
                return { ok: false, message: "Username must be 3-16 characters." };
            }
            if (!/^[A-Za-z0-9_]+$/.test(name)) {
                return { ok: false, message: "Letters, numbers and underscores only." };
            }
            if (findAccount(name)) {
                return { ok: false, message: "That username is taken on this device." };
            }
            if (String(password || "").length < 6) {
                return { ok: false, message: "Password must be at least 6 characters." };
            }

            const salt = randomSalt();
            let hash;
            try {
                hash = await hashPassword(password, salt);
            } catch (e) {
                return { ok: false, message: e.message };
            }

            const all = accounts();
            const account = {
                id: "u" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
                username: name,
                salt: salt,
                hash: hash,
                code: makeFriendCode(),
                created: Date.now()
            };
            all.push(account);
            writeJSON(ACCOUNTS_KEY, all);

            // Each account gets its own save slot, reusing the profile system that
            // already namespaces every per-player key.
            if (window.Profiles) {
                const p = Profiles.create(name) || Profiles.list()[0];
                account.profileId = p.id;
                writeJSON(ACCOUNTS_KEY, accounts().map(a => a.id === account.id ? account : a));
                Profiles.switchTo(p.id);
            }

            localStorage.setItem(SESSION_KEY, account.id);
            return { ok: true, account: account };
        },

        signIn: async function (username, password) {
            const account = findAccount(username);

            // Deliberately the same message for "no such user" and "wrong
            // password". Telling them apart is a way to find out which usernames
            // exist, and there is nothing to gain from being more specific.
            const failure = { ok: false, message: "Wrong username or password." };

            if (!account) return failure;

            let hash;
            try {
                hash = await hashPassword(password, account.salt);
            } catch (e) {
                return { ok: false, message: e.message };
            }
            if (hash !== account.hash) return failure;

            localStorage.setItem(SESSION_KEY, account.id);
            if (window.Profiles && account.profileId) Profiles.switchTo(account.profileId);
            return { ok: true, account: account };
        },

        signOut: function () {
            localStorage.removeItem(SESSION_KEY);
        },

        changePassword: async function (oldPassword, newPassword) {
            const account = this.current();
            if (!account) return { ok: false, message: "Not signed in." };
            if (String(newPassword || "").length < 6) {
                return { ok: false, message: "New password must be at least 6 characters." };
            }
            const check = await hashPassword(oldPassword, account.salt);
            if (check !== account.hash) return { ok: false, message: "Current password is wrong." };

            const salt = randomSalt();
            account.salt = salt;
            account.hash = await hashPassword(newPassword, salt);
            writeJSON(ACCOUNTS_KEY, accounts().map(a => a.id === account.id ? account : a));
            return { ok: true, message: "Password changed." };
        },

        myCode: function () {
            const a = this.current();
            return a ? a.code : "";
        }
    };


    /* =====================================================
       PLAYER CARDS + FRIENDS
    ===================================================== */

    // A card is a snapshot someone can hand you. Base64 keeps it one
    // copyable blob rather than something people have to retype accurately.
    function encode(obj) {
        try { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
        catch (e) { return ""; }
    }

    function decode(text) {
        try { return JSON.parse(decodeURIComponent(escape(atob(String(text || "").trim())))); }
        catch (e) { return null; }
    }

    /* =====================================================
       NOTIFICATIONS
       Lifted from GhostChat, which keeps a typed notification per
       event and a bell with an unread count. The types here are the
       ones ReviseGo can actually raise — there is no point carrying
       "call" or "mention" across when nothing produces them.
    ===================================================== */

    const NOTIFY_KEY = "reviseGoNotifications";

    window.Notify = {

        TYPES: {
            friend_request: { icon: "i-users", text: n => n.name + " wants to be friends" },
            friend_accepted: { icon: "i-check", text: n => n.name + " accepted your request" },
            challenge: { icon: "i-bolt", text: n => n.name + " challenged you — room " + n.room },
            room_result: { icon: "i-trophy", text: n => n.name + " scored " + n.detail },
            achievement: { icon: "i-trophy", text: n => "Achievement unlocked: " + n.detail }
        },

        list: function () {
            const all = readJSON(NOTIFY_KEY, []);
            return Array.isArray(all) ? all : [];
        },

        unread: function () {
            return this.list().filter(n => !n.read).length;
        },

        push: function (type, fields) {
            if (!this.TYPES[type]) return;
            const all = this.list();
            all.unshift(Object.assign({
                id: "n" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
                type: type,
                read: false,
                at: Date.now()
            }, fields || {}));
            // Capped: an unbounded list would grow forever in storage that has a
            // few megabytes total and is shared with every save file.
            writeJSON(NOTIFY_KEY, all.slice(0, 40));
        },

        markAllRead: function () {
            writeJSON(NOTIFY_KEY, this.list().map(n => Object.assign({}, n, { read: true })));
        },

        clear: function () { writeJSON(NOTIFY_KEY, []); },

        describe: function (n) {
            const t = this.TYPES[n.type];
            return t ? t.text(n) : "";
        },

        iconFor: function (n) {
            const t = this.TYPES[n.type];
            return t ? t.icon : "i-star";
        }
    };


    /* =====================================================
       FRIENDS — request, accept, decline
       =====================================================

       The first version added a friend the moment you pasted their
       card. That is not how friends work anywhere, including in
       GhostChat, where a request sits pending until the other person
       accepts — and it meant a one-way link: you had them, they had
       no idea you existed.

       With no server, the handshake is done with two codes:

         1. You send a REQUEST code.
         2. They paste it. It lands under "Requests" — not in their
            friends list — and they accept or decline.
         3. Accepting produces an ACCEPT code they send back.
         4. You paste that, and the link is complete both ways.

       It is more steps than a server would need, and the UI says so.
       What it is not is a lie about being connected.
    ===================================================== */

    const REQUESTS_KEY = "reviseGoRequests";

    function myProfileCard(kind) {
        const a = Accounts.current();
        if (!a) return null;
        const xp = Number(localStorage.getItem("reviseGoXP")) || 0;
        const player = typeof getPlayerData === "function" ? getPlayerData() : {};
        return {
            t: kind,
            code: a.code,
            name: a.username,
            xp: xp,
            level: typeof getLevelFromXP === "function" ? getLevelFromXP(xp) : 1,
            answered: player.questionsAnswered || 0,
            correct: player.correctAnswers || 0,
            streak: player.streak || 0,
            at: Date.now()
        };
    }

    window.Friends = {

        /** The code you send to ask someone to be friends. */
        requestCode: function () {
            const card = myProfileCard("revisego-request");
            return card ? encode(card) : "";
        },

        /** Your current stats, for refreshing a friend who already has you. */
        myCard: function () {
            const card = myProfileCard("revisego-card");
            return card ? encode(card) : "";
        },

        list: function () {
            const f = readJSON(FRIENDS_KEY, []);
            return Array.isArray(f) ? f : [];
        },

        requests: function () {
            const r = readJSON(REQUESTS_KEY, []);
            return Array.isArray(r) ? r : [];
        },

        incoming: function () { return this.requests().filter(r => r.dir === "in"); },
        outgoing: function () { return this.requests().filter(r => r.dir === "out"); },

        /** Record that you've sent a request, so the UI can show it pending. */
        markSent: function (label) {
            const all = this.requests();
            all.push({
                id: "r" + Date.now().toString(36),
                dir: "out",
                name: String(label || "Someone").trim().slice(0, 20) || "Someone",
                at: Date.now()
            });
            writeJSON(REQUESTS_KEY, all);
        },

        /**
         * One entry point for every code someone pastes. Which of the three it is
         * depends on the payload, not on which box it went into — asking a user to
         * know whether they hold a "request" or an "accept" is asking them to do
         * the app's job.
         */
        receive: function (text) {
            const card = decode(text);
            if (!card || String(card.t || "").indexOf("revisego-") !== 0) {
                return { ok: false, message: "That doesn't look like a ReviseGo code." };
            }

            const me = Accounts.current();
            if (me && card.code === me.code) {
                return { ok: false, message: "That's your own code." };
            }

            if (card.t === "revisego-request") return this._takeRequest(card);
            if (card.t === "revisego-accept") return this._takeAccept(card);
            if (card.t === "revisego-card") return this._refresh(card);

            return { ok: false, message: "That code isn't a friend code." };
        },

        _takeRequest: function (card) {
            if (this.list().some(f => f.code === card.code)) {
                return { ok: false, message: card.name + " is already your friend." };
            }
            const all = this.requests();
            if (all.some(r => r.dir === "in" && r.code === card.code)) {
                return { ok: false, message: "You already have a request from " + card.name + "." };
            }
            all.push(Object.assign({
                id: "r" + Date.now().toString(36), dir: "in"
            }, card));
            writeJSON(REQUESTS_KEY, all);
            Notify.push("friend_request", { name: card.name });
            return { ok: true, message: card.name + " wants to be friends.", request: true };
        },

        _takeAccept: function (card) {
            const all = this.requests();
            // Clear the matching outgoing request, if the name lines up. It is only
            // a label — there is no id to match on until they accept.
            const rest = all.filter(r => !(r.dir === "out" &&
                r.name.toLowerCase() === String(card.name).toLowerCase()));
            writeJSON(REQUESTS_KEY, rest);

            const friends = this.list();
            const at = friends.findIndex(f => f.code === card.code);
            const entry = Object.assign({ favourite: false }, card, { t: "revisego-card" });
            if (at !== -1) friends[at] = Object.assign({}, friends[at], entry);
            else friends.push(entry);
            writeJSON(FRIENDS_KEY, friends);

            Notify.push("friend_accepted", { name: card.name });
            return { ok: true, message: card.name + " accepted. You're friends." };
        },

        _refresh: function (card) {
            const friends = this.list();
            const at = friends.findIndex(f => f.code === card.code);
            if (at === -1) {
                return { ok: false, message:
                    card.name + " isn't your friend yet — ask them to send a request code." };
            }
            friends[at] = Object.assign({}, friends[at], card);
            writeJSON(FRIENDS_KEY, friends);
            return { ok: true, message: card.name + "'s stats updated.", updated: true };
        },

        /** Accept an incoming request. Returns the code to send back. */
        accept: function (id) {
            const all = this.requests();
            const req = all.filter(r => r.id === id && r.dir === "in")[0];
            if (!req) return { ok: false, message: "That request has gone." };

            writeJSON(REQUESTS_KEY, all.filter(r => r.id !== id));

            const friends = this.list();
            if (!friends.some(f => f.code === req.code)) {
                friends.push({
                    t: "revisego-card", code: req.code, name: req.name,
                    xp: req.xp, level: req.level, answered: req.answered,
                    correct: req.correct, streak: req.streak,
                    favourite: false, at: req.at
                });
                writeJSON(FRIENDS_KEY, friends);
            }

            const back = myProfileCard("revisego-accept");
            return {
                ok: true,
                message: "You're friends with " + req.name + ".",
                code: back ? encode(back) : "",
                name: req.name
            };
        },

        decline: function (id) {
            writeJSON(REQUESTS_KEY, this.requests().filter(r => r.id !== id));
        },

        toggleFavourite: function (code) {
            const friends = this.list();
            const f = friends.filter(x => x.code === code)[0];
            if (!f) return false;
            f.favourite = !f.favourite;
            writeJSON(FRIENDS_KEY, friends);
            return f.favourite;
        },

        remove: function (code) {
            writeJSON(FRIENDS_KEY, this.list().filter(f => f.code !== code));
        },

        // Me plus friends. Favourites first, then XP — a starred friend is the one
        // you care about beating, so burying them under a stranger defeats the star.
        leaderboard: function () {
            const me = Accounts.current();
            const rows = this.list().slice();
            if (me) {
                const xp = Number(localStorage.getItem("reviseGoXP")) || 0;
                rows.push({
                    code: me.code,
                    name: me.username,
                    xp: xp,
                    level: typeof getLevelFromXP === "function" ? getLevelFromXP(xp) : 1,
                    me: true,
                    at: Date.now()
                });
            }
            return rows.sort((a, b) =>
                (b.favourite ? 1 : 0) - (a.favourite ? 1 : 0) ||
                (b.xp || 0) - (a.xp || 0));
        }
    };


    /* =====================================================
       STUDY ROOMS
       =====================================================

       A room is a code. The code seeds the question order, so everyone
       who joins it gets THE SAME questions in the same order — which
       is what makes comparing scores fair. You play, you get a result
       code, you paste each other's in.

       No server means no live presence, and this does not pretend
       otherwise: the room shows who has submitted a result, not who
       is "online".
    ===================================================== */

    // Deterministic hash → seed. Same code, same questions, on every device.
    function seedFrom(code) {
        let h = 2166136261;
        const s = String(code || "").toUpperCase();
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function seededShuffle(list, seed) {
        const a = list.slice();
        let state = seed || 1;
        const next = () => {
            // xorshift32 — small, fast and identical across engines, which is the
            // whole requirement. Math.random() could not be reproduced.
            state ^= state << 13; state >>>= 0;
            state ^= state >> 17;
            state ^= state << 5;  state >>>= 0;
            return state / 4294967296;
        };
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(next() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    window.Rooms = {

        makeCode: makeFriendCode,

        list: function () {
            const r = readJSON(ROOMS_KEY, []);
            return Array.isArray(r) ? r : [];
        },

        get: function (code) {
            const c = String(code || "").toUpperCase();
            return this.list().filter(r => r.code === c)[0] || null;
        },

        create: function (name, subject) {
            const room = {
                code: makeFriendCode(),
                name: String(name || "Study room").trim().slice(0, 30) || "Study room",
                subject: subject || "",
                created: Date.now(),
                results: []
            };
            const all = this.list();
            all.push(room);
            writeJSON(ROOMS_KEY, all);
            return room;
        },

        join: function (code) {
            const c = String(code || "").trim().toUpperCase();
            if (!/^[A-Z2-9]{6}$/.test(c)) {
                return { ok: false, message: "Room codes are 6 characters." };
            }
            if (this.get(c)) return { ok: true, room: this.get(c) };

            // Joining a code you were given creates the room locally. The code IS
            // the room — there is nowhere else for it to live.
            const room = {
                code: c, name: "Room " + c, subject: "",
                created: Date.now(), results: []
            };
            const all = this.list();
            all.push(room);
            writeJSON(ROOMS_KEY, all);
            return { ok: true, room: room };
        },

        leave: function (code) {
            writeJSON(ROOMS_KEY, this.list().filter(r => r.code !== code));
        },

        // The same 10 questions for everyone with this code.
        questionsFor: function (code, subject) {
            const pool = questions.filter(q => !subject || q.subject === subject);
            if (!pool.length) return [];
            const shuffled = seededShuffle(pool, seedFrom(code));
            const out = shuffled.slice(0, 10);
            while (out.length < 10 && shuffled.length) out.push(shuffled[out.length % shuffled.length]);
            return out;
        },

        resultCode: function (code, score, total) {
            const me = Accounts.current();
            return encode({
                t: "revisego-result",
                room: String(code).toUpperCase(),
                name: me ? me.username : "Player",
                score: score,
                total: total,
                at: Date.now()
            });
        },

        submit: function (text) {
            const r = decode(text);
            if (!r || r.t !== "revisego-result") {
                return { ok: false, message: "That doesn't look like a ReviseGo result code." };
            }
            const room = this.get(r.room);
            if (!room) {
                return { ok: false, message: "You're not in room " + r.room + "." };
            }

            const all = this.list();
            const target = all.filter(x => x.code === room.code)[0];
            const at = target.results.findIndex(x => x.name === r.name);
            if (at !== -1) {
                // Keep the better attempt rather than the latest, so re-submitting
                // a worse run cannot knock someone down the table.
                if (r.score > target.results[at].score) target.results[at] = r;
            } else {
                target.results.push(r);
            }

            writeJSON(ROOMS_KEY, all);

            // Someone else's result is worth surfacing on the bell — it is the one
            // thing in a room that happens without you doing anything.
            const me = Accounts.current();
            if (window.Notify && (!me || r.name !== me.username)) {
                Notify.push("room_result", {
                    name: r.name,
                    detail: r.score + "/" + r.total + " in " + target.name
                });
            }

            return { ok: true, message: r.name + " added to " + target.name + "." };
        },

        recordMyResult: function (code, score, total) {
            this.submit(this.resultCode(code, score, total));
        }
    };

})();
