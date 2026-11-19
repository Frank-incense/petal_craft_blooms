/**
 * Petal Craft Blooms — SPA Router
 * Hash-based routing. Intercepts clicks on <a href="#/...">, fetches the
 * view fragment, swaps it into #view, updates nav active state, fires
 * "petal:view-loaded" for interested modules.
 *
 * Exposes: window.PetalRouter
 */

(function () {
    "use strict";

    const ROUTES = {
        "/":          { view: "./src/views/home.html",        title: "Petal Craft Blooms — Premium Florist",     scrollTo: null },
        "/shop":      { view: "./src/views/shop.html",        title: "Shop Flowers — Petal Craft Blooms",        scrollTo: null },
        "/builder":   { view: "./src/views/builder.html",     title: "Build Your Bouquet — Petal Craft Blooms",  scrollTo: null },
        "/checkout":  { view: "./src/views/checkout.html",    title: "Checkout — Petal Craft Blooms",            scrollTo: null },
        "/track":     { view: "./src/views/track_order.html", title: "Track Your Order — Petal Craft Blooms",    scrollTo: null },
        "/wholesale":            { view: "./src/views/wholesale.html",            title: "Wholesale Export — Petal Craft Blooms", scrollTo: null },
        "/wholesale/catalogue":  { view: "./src/views/wholesale_catalogue.html",  title: "Stem Catalogue — Petal Craft Blooms",   scrollTo: null },
        "/wholesale/cart":       { view: "./src/views/wholesale-cart.html",     title: "Your Order — Petal Craft Blooms",       scrollTo: null },
        "/occasions": { view: "./src/views/home.html",        title: "Petal Craft Blooms — Premium Florist",     scrollTo: "occasions" },
        "/about":     { view: "./src/views/home.html",        title: "Petal Craft Blooms — Premium Florist",     scrollTo: "about" },
        "/reviews":   { view: "./src/views/home.html",        title: "Petal Craft Blooms — Premium Florist",     scrollTo: "testimonials" },
    };

    const DEFAULT_ROUTE = "/";

    let currentRoute = null;
    let loadToken = 0;

    function getViewEl() {
        return document.getElementById("view");
    }

    function parseHash() {
        const raw = window.location.hash || "";
        const path = raw.replace(/^#/, "") || DEFAULT_ROUTE;
        return path.startsWith("/") ? path : "/" + path;
    }

    function navigate(path) {
        if (!path.startsWith("/")) path = "/" + path;
        const target = "#" + path;
        if (window.location.hash === target) {
            // Already there — refresh view in place.
            loadRoute(path);
        } else {
            window.location.hash = path; // fires hashchange → loadRoute
        }
    }

    async function loadRoute(path) {
        const cleanPath = path.split("?")[0];
        const route = ROUTES[cleanPath] || ROUTES[DEFAULT_ROUTE];
        const container = getViewEl();
        if (!container) return;

        const token = ++loadToken;
        currentRoute = cleanPath;

        try {
            const res = await fetch(route.view, { cache: "no-cache" });
            if (!res.ok) throw new Error("View not found: " + route.view);
            const html = await res.text();
            if (token !== loadToken) return; // superseded

            container.innerHTML = html;
            document.title = route.title || "Petal Craft Blooms";
            updateActiveNav(cleanPath);

            if (route.scrollTo) {
                requestAnimationFrame(function () {
                    const el = document.getElementById(route.scrollTo);
                    if (el) {
                        const navH = document.getElementById("navbar")?.offsetHeight || 0;
                        const top = el.getBoundingClientRect().top + window.pageYOffset - navH - 10;
                        window.scrollTo({ top, behavior: "smooth" });
                    } else {
                        window.scrollTo({ top: 0 });
                    }
                });
            } else {
                window.scrollTo({ top: 0 });
            }

            document.dispatchEvent(new CustomEvent("petal:view-loaded", {
                detail: { path: cleanPath, container: container }
            }));
        } catch (err) {
            if (token !== loadToken) return;
            container.innerHTML =
                '<section class="max-w-container mx-auto px-5 sm:px-8 lg:px-12 py-24 text-center">' +
                    '<h1 class="font-display text-3xl font-medium text-forest mb-3">We couldn\'t load that page</h1>' +
                    '<p class="text-stone text-sm mb-6">' + (err.message || "Unknown error") + '</p>' +
                    '<a href="#/" class="inline-flex items-center justify-center px-6 py-3 bg-forest text-ivory text-sm font-medium rounded-md hover:bg-forest-light transition-colors">Back to Home</a>' +
                '</section>';
        }
    }

        function updateActiveNav(path) {
        const homePaths = ["/", "/occasions", "/about", "/reviews"];
        const isHome = homePaths.indexOf(path) !== -1;
        const isWholesale = path === "/wholesale" || path.indexOf("/wholesale/") === 0;

        document.querySelectorAll("[data-nav-route]").forEach(function (el) {
            const route = el.getAttribute("data-nav-route");
            const active =
                (route === "/" && isHome) ||
                (route === "/shop" && path === "/shop") ||
                (route === "/builder" && path === "/builder") ||
                (route === "/wholesale" && isWholesale);

            if (active) {
                el.classList.remove("text-stone", "hover:text-forest");
                el.classList.add("text-forest", "font-semibold");
            } else {
                el.classList.add("text-stone", "hover:text-forest");
                el.classList.remove("text-forest", "font-semibold");
            }
        });
    }

    function onLinkClick(e) {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const anchor = e.target.closest("a");
        if (!anchor) return;

        const href = anchor.getAttribute("href");
        if (!href || !href.startsWith("#/")) return;

        e.preventDefault();
        navigate(href.slice(1));
    }

    function start() {
        document.addEventListener("click", onLinkClick);
        window.addEventListener("hashchange", function () {
            loadRoute(parseHash());
        });

        if (!window.location.hash) {
            window.history.replaceState(null, "", "#" + DEFAULT_ROUTE);
        }
        loadRoute(parseHash());
    }

    window.PetalRouter = {
        navigate: navigate,
        start: start,
        getCurrentRoute: function () { return currentRoute; },
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();