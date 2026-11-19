/**
 * Petal Craft Blooms — Global shell behaviour
 * SPA Phase 1: sticky nav, mobile menu, newsletter form (delegated),
 * smooth scroll for in-page anchors. Everything is bound once to the
 * document, so it survives view swaps without re-binding.
 */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        initStickyNav();
        initMobileMenu();
        initNewsletterFormDelegated();
        initInPageSmoothScroll();
        initLinkPrefetch();
        initHoverPolyfill();
    });
    // ==================== HOVER POLYFILL ====================
    // Some environments (touchscreen laptops, remote desktop sessions)
    // report the primary input as touch, and Chrome refuses to fire
    // native :hover in that mode. This polyfill mirrors the effect by
    // adding a `.hover-active` class on mouseenter — which the CSS has
    // been told to treat the same as :hover (see @custom-variant in
    // src/style.css).
    //
    // Runs unconditionally: if native :hover already works, the extra
    // class is harmless because both selectors apply the same styles.
    function initHoverPolyfill() {
        document.addEventListener("mouseover", function (e) {
            var target = e.target.closest('[class*="hover:"], .group');
            if (target) target.classList.add("hover-active");
        }, true);

        document.addEventListener("mouseout", function (e) {
            var target = e.target.closest(".hover-active");
            if (target) target.classList.remove("hover-active");
        }, true);
    }
     
    // ==================== LINK PREFETCH ====================
    // On hover/touch of an internal link, warm the cache with the target
    // page so the actual click is near-instant. Non-blocking: if it fails,
    // navigation still works normally.
    //
    // Runs after idle so it never competes with first-paint resources.
    function initLinkPrefetch() {
        if (!("requestIdleCallback" in window)) {
            window.requestIdleCallback = function (cb) { return setTimeout(cb, 1); };
        }

        var prefetched = {};

        function prefetch(url) {
            if (!url || prefetched[url]) return;
            prefetched[url] = true;

            // For hash routes, translate "#/shop" to the view file the
            // router will actually fetch: "views/shop.html"
            var routerView = hashToViewPath(url);
            var target = routerView || url;
            if (!target) return;

            var link = document.createElement("link");
            link.rel = "prefetch";
            link.href = target;
            link.as = "document";
            document.head.appendChild(link);
        }

        function hashToViewPath(href) {
            if (!href || href.indexOf("#/") !== 0) return null;
            var route = href.slice(1); // "/shop"
            if (route === "/") route = "/home";
            // Map "/occasions", "/about", "/reviews" → home view
            if (route === "/occasions" || route === "/about" || route === "/reviews") {
                route = "/home";
            }
            return "views" + route + ".html";
        }

        function shouldPrefetch(anchor) {
            var href = anchor.getAttribute("href");
            if (!href) return false;
            if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
            if (anchor.hasAttribute("data-cart-open")) return false;
            if (anchor.hasAttribute("data-cart-open-close")) return false;
            if (anchor.target && anchor.target !== "_self") return false;

            // In-page anchors are cheap — nothing to prefetch
            if (href.startsWith("#") && !href.startsWith("#/")) return false;

            // Only same-origin
            try {
                var url = new URL(anchor.href, window.location.href);
                if (url.origin !== window.location.origin) return false;
                return true;
            } catch (e) {
                return false;
            }
        }

        // Hover-based prefetch for desktop
        document.addEventListener("mouseover", function (e) {
            var anchor = e.target.closest("a[href]");
            if (!anchor || !shouldPrefetch(anchor)) return;
            prefetch(anchor.getAttribute("href"));
        }, { passive: true });

        // Touch devices don't fire mouseover reliably; prefetch on the
        // first tap. Navigation still happens normally because we don't
        // preventDefault — the browser is already fetching the URL, and
        // the prefetch just warms the cache for the second tap.
        document.addEventListener("touchstart", function (e) {
            var anchor = e.target.closest("a[href]");
            if (!anchor || !shouldPrefetch(anchor)) return;
            prefetch(anchor.getAttribute("href"));
        }, { passive: true });

        // Warm the top-priority nav links after first idle, so the very
        // first hover feels instant even on a cold cache.
        window.requestIdleCallback(function () {
            document.querySelectorAll("header a[href^='#/'], nav a[href^='#/']").forEach(function (a) {
                if (shouldPrefetch(a)) prefetch(a.getAttribute("href"));
            });
        }, { timeout: 2000 });
    }
    // ==================== STICKY NAV ====================
    function initStickyNav() {
        const navbar = document.getElementById("navbar");
        if (!navbar) return;

        window.addEventListener("scroll", function () {
            if (window.scrollY > 50) {
                navbar.classList.add("shadow-md");
                navbar.classList.remove("shadow-sm");
            } else {
                navbar.classList.remove("shadow-md");
                navbar.classList.add("shadow-sm");
            }
        }, { passive: true });
    }

    // ==================== MOBILE MENU ====================
    function initMobileMenu() {
        const btn = document.getElementById("mobile-menu-btn");
        const menu = document.getElementById("mobile-menu");
        if (!btn || !menu) return;

        btn.addEventListener("click", function () {
            menu.classList.toggle("hidden");
        });

        // Close menu when any link inside it is clicked
        menu.addEventListener("click", function (e) {
            if (e.target.closest("a")) menu.classList.add("hidden");
        });
    }

    // ==================== NEWSLETTER (DELEGATED) ====================
    // Bound to document so it works no matter how many times the
    // home view is mounted / unmounted.
    function initNewsletterFormDelegated() {
        document.addEventListener("submit", function (e) {
            const form = e.target;
            if (form.id !== "newsletter-form") return;
            e.preventDefault();

            const emailInput = form.querySelector("#newsletter-email");
            const message = form.querySelector("#newsletter-message");
            if (!emailInput || !message) return;

            const email = emailInput.value.trim();
            const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            if (!valid) {
                showMessage(message, "Please enter a valid email address.", false);
                return;
            }
            showMessage(message, "Thank you for subscribing! 🌸", true);
            emailInput.value = "";
        });

        function showMessage(el, text, success) {
            el.textContent = text;
            el.classList.remove("hidden", "text-sage-light", "text-rose");
            el.classList.add(success ? "text-sage-light" : "text-rose");
            setTimeout(function () {
                el.classList.add("hidden");
            }, 4000);
        }
    }

    // ==================== IN-PAGE ANCHOR SMOOTH SCROLL ====================
    // Only handles `#anchor` links that are NOT router routes (`#/...`).
    function initInPageSmoothScroll() {
        document.addEventListener("click", function (e) {
            const anchor = e.target.closest('a[href^="#"]');
            if (!anchor) return;
            const href = anchor.getAttribute("href");
            if (!href || href === "#" || href.startsWith("#/")) return;

            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();
            const navH = document.getElementById("navbar")?.offsetHeight || 0;
            const top = target.getBoundingClientRect().top + window.pageYOffset - navH - 10;
            window.scrollTo({ top: top, behavior: "smooth" });
        });
    }
})();