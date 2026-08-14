/* =========================================================
   REVISEGO — PROFILES, PREMIUM AND UNLOCKS
   =========================================================

   THIS FILE MUST LOAD BEFORE app.js. app.js calls loadPlayerData()
   on its last line, synchronously, so anything that changes where
   player data is READ FROM has to be in place before it runs.

   ── WHAT AN "ACCOUNT" IS HERE, HONESTLY ──────────────────────────
   These are LOCAL PROFILES, stored in this browser. There is no
   server, no password, and nothing is synced — switching profiles is
   picking a save slot, not signing in. Two people can share a laptop
   and keep separate XP; the same person on a different device starts
   from scratch.

   Real accounts need a backend to hold the data and check who you
   are. Nothing here pretends otherwise: the UI says "on this device",
   and there is no password box, because a password field that
   protects nothing teaches people their password is safe when it
   isn't.

   ── HOW IT WORKS ─────────────────────────────────────────────────
   Rather than rewriting every localStorage call in app.js, the keys
   are namespaced underneath it: `reviseGoXP` becomes `reviseGoXP::p2`
   for the second profile. app.js is unchanged and gets per-player
   saves for free.
========================================================= */

(function () {
    "use strict";

    const LIST_KEY = "reviseGoProfiles";
    const ACTIVE_KEY = "reviseGoActiveProfile";

    // Keys that belong to ONE PLAYER and get namespaced.
    //
    // reviseGoPremium is deliberately NOT in this list. Premium is bought once
    // for the device, and making each save slot pay again would be a way of
    // charging the same person twice for the same thing.
    const PER_PLAYER = [
        "reviseGoXP",
        "reviseGoPlayer",
        "reviseGoMistakes",
        "reviseGoStats"
    ];

    // THE PATCH GOES ON Storage.prototype, NOT ON THE localStorage OBJECT.
    //
    // `localStorage` is a platform object with a named-property proxy, so
    // `localStorage.getItem = fn` does not override the method. In jsdom it is
    // silently ignored; in a browser it is worse — Storage is
    // [LegacyOverrideBuiltIns], so it stores an ITEM called "getItem" and the
    // real method carries on unchanged. Either way the redirect never happens
    // and every profile shares one save. Caught by the smoke test, which is the
    // only reason it isn't shipping.
    const proto = Storage.prototype;

    const raw = {
        get: proto.getItem,
        set: proto.setItem,
        del: proto.removeItem
    };

    // Bound helpers for this module's own reads, which must never be redirected.
    const rawGet = k => raw.get.call(localStorage, k);
    const rawSet = (k, v) => raw.set.call(localStorage, k, v);
    const rawDel = k => raw.del.call(localStorage, k);

    function readList() {
        try {
            const list = JSON.parse(rawGet(LIST_KEY) || "[]");
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function writeList(list) {
        rawSet(LIST_KEY, JSON.stringify(list));
    }

    function activeId() {
        return rawGet(ACTIVE_KEY) || "";
    }

    function keyFor(base, id) {
        // The first profile keeps the ORIGINAL, un-suffixed keys. That is what
        // lets an existing player keep the XP they already earned instead of
        // being silently reset to level 1 by an update.
        return id && id !== "p1" ? base + "::" + id : base;
    }


    /* =====================================================
       BOOTSTRAP — runs before app.js reads anything
    ===================================================== */

    let list = readList();

    if (!list.length) {
        // Adopt whatever is already in storage as the first profile rather than
        // starting a fresh one beside it. Because p1 keeps the original
        // un-suffixed keys, an existing player's XP, achievements and streak
        // carry straight over — this update must not reset anyone to level 1.
        list = [{ id: "p1", name: "Player 1", created: Date.now() }];
        writeList(list);
        rawSet(ACTIVE_KEY, "p1");
    }

    if (!activeId() || !list.some(p => p.id === activeId())) {
        rawSet(ACTIVE_KEY, list[0].id);
    }


    /* =====================================================
       THE INTERCEPT
       Every per-player key is transparently redirected to the
       active profile's copy.
    ===================================================== */

    function redirect(key) {
        return PER_PLAYER.indexOf(key) === -1 ? key : keyFor(key, activeId());
    }

    // `this` is preserved so sessionStorage keeps working normally; only the
    // handful of keys in PER_PLAYER are ever rewritten.
    proto.getItem = function (key) {
        return raw.get.call(this, redirect(key));
    };

    proto.setItem = function (key, value) {
        return raw.set.call(this, redirect(key), value);
    };

    proto.removeItem = function (key) {
        return raw.del.call(this, redirect(key));
    };


    /* =====================================================
       PUBLIC API
    ===================================================== */

    function slug() {
        // Sequential ids, skipping any already taken, so deleting p2 and adding
        // a profile cannot resurrect the deleted player's save data.
        const taken = readList().map(p => p.id);
        let n = 1;
        while (taken.indexOf("p" + n) !== -1) n++;
        return "p" + n;
    }

    window.Profiles = {

        list: readList,

        activeId: activeId,

        active: function () {
            const id = activeId();
            return readList().filter(p => p.id === id)[0] || null;
        },

        name: function () {
            const p = this.active();
            return p ? p.name : "Player 1";
        },

        create: function (name) {
            const clean = String(name || "").trim().slice(0, 20);
            if (!clean) return null;

            const all = readList();
            if (all.length >= 6) return null;          // a shared laptop, not a school

            const profile = { id: slug(), name: clean, created: Date.now() };
            all.push(profile);
            writeList(all);
            return profile;
        },

        rename: function (id, name) {
            const clean = String(name || "").trim().slice(0, 20);
            if (!clean) return false;
            const all = readList();
            const p = all.filter(x => x.id === id)[0];
            if (!p) return false;
            p.name = clean;
            writeList(all);
            return true;
        },

        switchTo: function (id) {
            if (!readList().some(p => p.id === id)) return false;
            rawSet(ACTIVE_KEY, id);
            return true;
        },

        remove: function (id) {
            const all = readList();
            if (all.length <= 1) return false;         // never leave zero profiles
            const rest = all.filter(p => p.id !== id);
            writeList(rest);

            // Delete that player's saves too. Leaving them behind would mean a
            // "deleted" profile quietly reappearing the moment its id was reused.
            PER_PLAYER.forEach(base => rawDel(keyFor(base, id)));

            if (activeId() === id) rawSet(ACTIVE_KEY, rest[0].id);
            return true;
        }
    };


    /* =====================================================
       PREMIUM
       =====================================================

       WHAT IS AND IS NOT REAL HERE.

       Taking a card payment needs a server. A static page cannot hold
       a secret key, cannot verify a payment happened, and must never
       collect card details itself — so this does not show a card form.
       A checkout box that looks real but isn't is worse than none: it
       trains people to type card numbers into anything that asks.

       So payment goes to STRIPE, on Stripe's own hosted page, via a
       Payment Link. That part is genuinely real once PAYMENT_LINK is
       filled in — Stripe handles the card, the receipt and the
       compliance.

       Coming BACK is the honest gap. Verifying "this person paid"
       needs a webhook and a server, which this app does not have. So
       after paying, the buyer gets an unlock code and redeems it here.
       The codes live in this file, which means a determined person can
       open devtools and read them. That is a real limitation and it is
       written down rather than hidden: it is the standard trade-off
       for a serverless app, and the fix is a backend, not a cleverer
       hiding place.
    ===================================================== */

    // Paste a Stripe Payment Link here (Stripe Dashboard → Payment links).
    // While it is empty the pay button explains that payment isn't set up yet
    // instead of leading somewhere broken.
    const PAYMENT_LINK = "";

    // Codes handed out after purchase. Replace these before going live.
    const CODES = [
        "ARCADE-GOLD",
        "REVISE-PRO",
        "LEVELUP-2026"
    ];

    window.Premium = {

        paymentLink: PAYMENT_LINK,

        isUnlocked: function () {
            return localStorage.getItem("reviseGoPremium") === "true";
        },

        // Not namespaced: bought once for the device, see PER_PLAYER above.
        redeem: function (code) {
            const clean = String(code || "").trim().toUpperCase();
            if (!clean) return { ok: false, message: "Enter your unlock code." };

            if (CODES.indexOf(clean) === -1) {
                return { ok: false, message: "That code isn't valid. Check for typos." };
            }

            if (this.isUnlocked()) {
                return { ok: true, message: "Premium is already unlocked on this device." };
            }

            localStorage.setItem("reviseGoPremium", "true");
            return { ok: true, message: "Premium unlocked. Boss Battle and Speed Run are open." };
        },

        // Present so a future backend has one obvious place to call.
        grant: function () {
            localStorage.setItem("reviseGoPremium", "true");
        }
    };


    /* =====================================================
       GAME UNLOCKS
       =====================================================

       One place that decides whether a game is playable, so the home
       screen, the click handler and any future game agree. Adding a
       game means adding a row here, not editing three files.
    ===================================================== */

    window.GAMES = [
        {
            id: "quick-battle",
            name: "Quick Battle",
            requiresLevel: 1,
            requiresPremium: false
        },
        {
            id: "boss-battle",
            name: "Boss Battle",
            requiresLevel: 3,
            requiresPremium: true
        },
        {
            id: "speed-run",
            name: "Speed Run",
            requiresLevel: 5,
            requiresPremium: true
        }
    ];

    window.gameLockState = function (game) {
        const totalXP = Number(localStorage.getItem("reviseGoXP")) || 0;
        const level = typeof getLevelFromXP === "function" ? getLevelFromXP(totalXP) : 1;

        // Level is checked BEFORE premium on purpose: telling someone to buy
        // premium for a game they still could not play would be selling them
        // something that does not do what they think.
        if (game.requiresLevel > level) {
            return {
                locked: true,
                reason: "level",
                message: "Reach level " + game.requiresLevel + " to unlock"
            };
        }

        if (game.requiresPremium && !window.Premium.isUnlocked()) {
            return { locked: true, reason: "premium", message: "Premium" };
        }

        return { locked: false, reason: "", message: "" };
    };

})();
