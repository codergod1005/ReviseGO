/* =========================================================
   REVISEGO — TOASTS AND DIALOGS
   =========================================================

   Replaces alert(), confirm() and prompt().

   Browser popups break the app in three ways that matter here:
   they are styled by the operating system so they look like a
   security warning rather than part of a game; they freeze the whole
   page, including the countdown in a timed round; and on mobile they
   can be suppressed entirely, which means an "are you sure?" a user
   never sees.

   These are ordinary DOM: a non-blocking toast for "that happened",
   and a real dialog for the two questions that need an answer.

   ACCESSIBILITY IS THE HARD PART OF A CUSTOM DIALOG, and skipping it
   is why hand-rolled ones are usually worse than the native it
   replaced. This one traps Tab inside itself, closes on Escape,
   restores focus to whatever opened it, and marks the rest of the
   page inert so a screen reader cannot wander out of it.
========================================================= */

(function () {
    "use strict";

    let host = null;
    let openDialog = null;

    function ensureHost() {
        if (host && document.body.contains(host)) return host;
        host = document.createElement("div");
        host.className = "toast-host";
        host.setAttribute("role", "status");
        host.setAttribute("aria-live", "polite");
        document.body.appendChild(host);
        return host;
    }

    function iconFor(kind) {
        const id = kind === "ok" ? "i-check" : kind === "bad" ? "i-x" : "i-star";
        return '<svg class="icon" aria-hidden="true"><use href="#' + id + '"/></svg>';
    }


    /* =====================================================
       TOAST
    ===================================================== */

    function toast(message, kind, ms) {
        if (!message) return;
        const wrap = ensureHost();

        const el = document.createElement("div");
        el.className = "toast " + (kind || "info");
        el.innerHTML = iconFor(kind) + "<span></span>";
        // textContent, not innerHTML: messages carry usernames and room names,
        // which are user input and must never be parsed as markup.
        el.querySelector("span").textContent = message;

        wrap.appendChild(el);

        const life = ms || (kind === "bad" ? 5200 : 3200);
        setTimeout(() => {
            el.classList.add("out");
            setTimeout(() => el.remove(), 260);
        }, life);

        return el;
    }


    /* =====================================================
       DIALOG
    ===================================================== */

    const FOCUSABLE =
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function buildDialog(opts) {
        const back = document.createElement("div");
        back.className = "dialog-back";

        const box = document.createElement("div");
        box.className = "dialog" + (opts.danger ? " danger" : "");
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        box.setAttribute("aria-labelledby", "dlg-title");

        let inner =
            '<h2 id="dlg-title">' + escapeText(opts.title || "Are you sure?") + "</h2>";

        if (opts.body) inner += "<p>" + escapeText(opts.body) + "</p>";

        if (opts.input) {
            inner +=
                '<label for="dlg-input">' + escapeText(opts.label || "") + "</label>" +
                '<input id="dlg-input" type="text" maxlength="' + (opts.maxlength || 40) + '"' +
                ' placeholder="' + escapeText(opts.placeholder || "") + '"' +
                ' value="' + escapeText(opts.value || "") + '">';
        }

        // A note has nothing to decline, so it gets one button. Offering "Cancel"
        // next to "Got it" would be asking a question that wasn't asked.
        inner +=
            '<div class="dialog-buttons">' +
                (opts.onlyOk ? "" :
                    '<button class="secondary-button" data-act="cancel">' +
                    escapeText(opts.cancel || "Cancel") + "</button>") +
                '<button class="' + (opts.danger ? "danger-button solid" : "main-button") +
                    '" data-act="ok">' + escapeText(opts.confirm || "Confirm") + "</button>" +
            "</div>";

        box.innerHTML = inner;
        back.appendChild(box);
        return { back, box };
    }

    function escapeText(s) {
        return String(s == null ? "" : s)
            .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }

    function show(opts) {
        return new Promise(resolve => {
            // Only ever one dialog. A second would steal the focus trap from the
            // first and leave the page permanently inert when it closed.
            if (openDialog) openDialog.close(null);

            // A closed dialog lingers for its 160ms fade. If another opens inside
            // that window there are briefly two in the DOM, and any lookup by
            // selector finds the DEAD one — including the click handlers a user
            // would be aiming at. Clear the corpses before adding the new one.
            document.querySelectorAll(".dialog-back").forEach(el => el.remove());

            const { back, box } = buildDialog(opts);
            const previouslyFocused = document.activeElement;

            const main = document.querySelector("main");
            const bar = document.querySelector(".top-bar");
            [main, bar].forEach(el => el && el.setAttribute("inert", ""));

            document.body.appendChild(back);
            document.body.classList.add("dialog-open");

            const input = box.querySelector("#dlg-input");
            const okBtn = box.querySelector('[data-act="ok"]');
            (input || okBtn).focus();
            if (input) input.select();

            function close(value) {
                document.removeEventListener("keydown", onKey, true);
                back.classList.add("out");
                setTimeout(() => {
                    back.remove();
                    document.body.classList.remove("dialog-open");
                    [main, bar].forEach(el => el && el.removeAttribute("inert"));
                    // Put focus back where it came from, or the next Tab starts
                    // from the top of the document.
                    if (previouslyFocused && previouslyFocused.focus) {
                        try { previouslyFocused.focus(); } catch (e) {}
                    }
                }, 160);
                openDialog = null;
                resolve(value);
            }

            openDialog = { close };

            function onKey(e) {
                if (e.key === "Escape") {
                    e.preventDefault();
                    close(opts.input ? null : false);
                    return;
                }
                if (e.key === "Enter" && input && document.activeElement === input) {
                    e.preventDefault();
                    okBtn.click();
                    return;
                }
                if (e.key !== "Tab") return;

                // The trap. Without it, Tab walks out of the dialog and into a
                // page the user cannot see.
                const items = Array.prototype.filter.call(
                    box.querySelectorAll(FOCUSABLE), el => !el.disabled);
                if (!items.length) return;
                const first = items[0], last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault(); last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault(); first.focus();
                }
            }

            document.addEventListener("keydown", onKey, true);

            const cancelBtn = box.querySelector('[data-act="cancel"]');
            if (cancelBtn) {
                cancelBtn.addEventListener("click", () => close(opts.input ? null : false));
            }

            okBtn.addEventListener("click", () => {
                if (!opts.input) return close(true);
                const value = input.value.trim();
                if (!value) { input.focus(); return; }
                close(value);
            });

            // Clicking the backdrop cancels, but only the backdrop itself —
            // a click that started inside the box and drifted out must not.
            back.addEventListener("mousedown", e => {
                if (e.target === back) close(opts.input ? null : false);
            });
        });
    }


    window.UI = {

        toast: toast,
        ok: (m) => toast(m, "ok"),
        bad: (m) => toast(m, "bad"),
        info: (m) => toast(m, "info"),

        /** Resolves true / false. */
        confirm: (opts) => show(Object.assign({ confirm: "Confirm" }, opts || {})),

        /** Resolves the trimmed string, or null if cancelled. */
        prompt: (opts) => show(Object.assign(
            { input: true, confirm: "Save", cancel: "Cancel" }, opts || {})),

        /** A message that needs acknowledging rather than a decision. */
        note: (opts) => show(Object.assign(
            { confirm: "Got it", cancel: null }, opts || {}, { onlyOk: true }))
    };

})();
