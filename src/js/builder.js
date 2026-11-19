/**
 * Petal Craft Blooms — Custom Bouquet Builder (SPA)
 * Phase 4: configurator state, live pricing, summary, add-to-cart handoff.
 *
 * Lifecycle: initialises on DOMContentLoaded and on every petal:view-loaded.
 * Because the router mounts a fresh copy of views/builder.html on each
 * navigation to #/builder, event bindings are scoped to the view's
 * elements and vanish with it — no manual teardown required.
 *
 * Depends on: window.PetalCart (js/cart.js)
 */

(function () {
    "use strict";

    // ==================== DATA ====================
    const FLOWERS = [
        { id: "rose",       name: "Roses",         price: 180, image: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=300&q=75" },
        { id: "lily",       name: "Lilies",        price: 220, image: "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?w=300&q=75" },
        { id: "tulip",      name: "Tulips",        price: 130, image: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=300&q=75" },
        { id: "sunflower",  name: "Sunflowers",    price: 180, image: "https://images.unsplash.com/photo-1548586196-aa5803b77379?w=300&q=75" },
        { id: "carnation",  name: "Carnations",    price: 110, image: "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=300&q=75" },
        { id: "babys",      name: "Baby's Breath", price: 90,  image: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=300&q=75" },
        { id: "eucalyptus", name: "Eucalyptus",    price: 70,  image: "https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=300&q=75" },
    ];

    const WRAPPINGS = [
        { id: "kraft",   name: "Kraft",   price: 500,  color: "#B8956A" },
        { id: "white",   name: "White",   price: 600,  color: "#F5F5F5" },
        { id: "blush",   name: "Blush",   price: 700,  color: "#E8C4C4" },
        { id: "premium", name: "Premium", price: 1000, color: "#2D4A3E" },
    ];

    const RIBBONS = [
        { id: "white",    name: "White",    price: 100, color: "#FFFFFF" },
        { id: "pink",     name: "Pink",     price: 100, color: "#F7C5CC" },
        { id: "burgundy", name: "Burgundy", price: 150, color: "#7A1F2E" },
        { id: "sage",     name: "Sage",     price: 150, color: "#9CAF88" },
        { id: "gold",     name: "Gold",     price: 200, color: "#D4AF37" },
    ];

    const MIN_STEMS = 5;
    const MAX_PER_FLOWER = 30;
    const MAX_MESSAGE = 200;

    // ==================== STATE ====================
    // Module-level so pricing helpers can close over it, but reset on each
    // mount so returning to the builder gives the customer a clean canvas.
    const state = {
        flowers: {},           // { rose: 3, tulip: 2 }
        wrapping: "kraft",
        ribbon: "white",
        message: "",
    };

    function resetState() {
        state.flowers = {};
        state.wrapping = "kraft";
        state.ribbon = "white";
        state.message = "";
    }

    // ==================== UTILITIES ====================
    function $(id) { return document.getElementById(id); }
    function kes(n) { return window.PetalCart.formatKES(n); }

    function totalStems() {
        return Object.keys(state.flowers).reduce(function (sum, id) {
            return sum + (state.flowers[id] || 0);
        }, 0);
    }

    function flowerSubtotal() {
        return Object.keys(state.flowers).reduce(function (sum, id) {
            const f = FLOWERS.find(function (x) { return x.id === id; });
            return f ? sum + f.price * state.flowers[id] : sum;
        }, 0);
    }

    function wrappingPrice() {
        const w = WRAPPINGS.find(function (x) { return x.id === state.wrapping; });
        return w ? w.price : 0;
    }

    function ribbonPrice() {
        const r = RIBBONS.find(function (x) { return x.id === state.ribbon; });
        return r ? r.price : 0;
    }

    function grandTotal() {
        return flowerSubtotal() + wrappingPrice() + ribbonPrice();
    }

    // ==================== RENDER: FLOWERS ====================
    function renderFlowerGrid() {
        const grid = $("flower-grid");
        if (!grid) return;

        grid.innerHTML = FLOWERS.map(function (f) {
            const qty = state.flowers[f.id] || 0;
            const cardCls = qty > 0
                ? "bg-white border border-forest rounded-xl overflow-hidden flex flex-col transition-colors"
                : "bg-white border border-beige/60 rounded-xl overflow-hidden flex flex-col transition-colors";
            const decDisabled = qty <= 0;
            const incDisabled = qty >= MAX_PER_FLOWER;

            return (
                '<div class="' + cardCls + '">' +
                    '<div class="aspect-square overflow-hidden bg-cream">' +
                        '<img src="' + f.image + '" alt="' + f.name + '" class="w-full h-full object-cover" loading="lazy" />' +
                    '</div>' +
                    '<div class="p-3 flex-1 flex flex-col">' +
                        '<h3 class="text-sm font-medium text-forest leading-tight">' + f.name + '</h3>' +
                        '<p class="text-[11px] text-stone mt-0.5 mb-3">' + kes(f.price) + ' / stem</p>' +
                        '<div class="mt-auto inline-flex items-center border border-beige rounded-md overflow-hidden self-start">' +
                            '<button type="button" data-flower-dec="' + f.id + '" aria-label="Decrease" ' +
                                'class="w-7 h-7 text-forest text-sm leading-none hover:bg-cream ' +
                                (decDisabled ? 'opacity-30 cursor-not-allowed' : '') + '">−</button>' +
                            '<span class="w-8 h-7 flex items-center justify-center text-xs font-medium text-forest border-x border-beige">' + qty + '</span>' +
                            '<button type="button" data-flower-inc="' + f.id + '" aria-label="Increase" ' +
                                'class="w-7 h-7 text-forest text-sm leading-none hover:bg-cream ' +
                                (incDisabled ? 'opacity-30 cursor-not-allowed' : '') + '">+</button>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );
        }).join("");
    }

    // ==================== RENDER: WRAPPING ====================
    function renderWrappingGrid() {
        const grid = $("wrapping-grid");
        if (!grid) return;

        grid.innerHTML = WRAPPINGS.map(function (w) {
            const selected = state.wrapping === w.id;
            const cls = "flex items-center gap-3 p-3 rounded-lg border text-left transition-colors " +
                (selected
                    ? "border-forest bg-forest/5 ring-1 ring-forest"
                    : "border-beige bg-white hover:border-sage");

            return (
                '<button type="button" data-wrapping-id="' + w.id + '" class="' + cls + '">' +
                    '<span class="w-8 h-8 rounded-md flex-shrink-0 border border-black/10" style="background-color:' + w.color + ';"></span>' +
                    '<span class="flex-1 min-w-0">' +
                        '<span class="block text-sm font-medium text-forest leading-tight">' + w.name + '</span>' +
                        '<span class="block text-[11px] text-stone mt-0.5">' + kes(w.price) + '</span>' +
                    '</span>' +
                '</button>'
            );
        }).join("");
    }

    // ==================== RENDER: RIBBON ====================
    function renderRibbonGrid() {
        const grid = $("ribbon-grid");
        if (!grid) return;

        grid.innerHTML = RIBBONS.map(function (r) {
            const selected = state.ribbon === r.id;
            const cls = "flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors " +
                (selected
                    ? "border-forest bg-forest/5 ring-1 ring-forest"
                    : "border-beige bg-white hover:border-sage");

            const swatchBorder = r.id === "white" ? "border border-black/15" : "border border-black/10";

            return (
                '<button type="button" data-ribbon-id="' + r.id + '" class="' + cls + '">' +
                    '<span class="w-9 h-9 rounded-full ' + swatchBorder + '" style="background-color:' + r.color + ';"></span>' +
                    '<span class="text-center">' +
                        '<span class="block text-xs font-medium text-forest leading-tight">' + r.name + '</span>' +
                        '<span class="block text-[10px] text-stone mt-0.5">' + kes(r.price) + '</span>' +
                    '</span>' +
                '</button>'
            );
        }).join("");
    }

    // ==================== RENDER: SUMMARY ====================
    function summaryLineHTML(label, value) {
        return (
            '<div class="flex items-center justify-between gap-3 text-sm">' +
                '<span class="text-stone">' + label + '</span>' +
                '<span class="text-forest font-medium whitespace-nowrap">' + value + '</span>' +
            '</div>'
        );
    }

    function renderSummary() {
        const content = $("summary-content");
        const totalEl = $("summary-total");
        const hintEl = $("summary-hint");
        const addBtn = $("add-to-cart-btn");
        if (!content || !totalEl || !addBtn) return;

        const lines = [];

        FLOWERS.forEach(function (f) {
            const qty = state.flowers[f.id] || 0;
            if (qty > 0) {
                lines.push(summaryLineHTML(f.name + " × " + qty, kes(f.price * qty)));
            }
        });

        const stems = totalStems();

        if (lines.length === 0) {
            content.innerHTML =
                '<p class="text-stone text-sm italic">No flowers selected yet — start with Step 1.</p>';
        } else {
            const w = WRAPPINGS.find(function (x) { return x.id === state.wrapping; });
            const r = RIBBONS.find(function (x) { return x.id === state.ribbon; });
            lines.push(summaryLineHTML(w.name + " wrap", kes(w.price)));
            lines.push(summaryLineHTML(r.name + " ribbon", kes(r.price)));
            content.innerHTML = lines.join("");
        }

        totalEl.textContent = kes(grandTotal());

        if (stems < MIN_STEMS) {
            addBtn.disabled = true;
            const remaining = MIN_STEMS - stems;
            if (hintEl) hintEl.textContent = "Add " + remaining + " more stem" + (remaining === 1 ? "" : "s") + " to continue";
        } else {
            addBtn.disabled = false;
            if (hintEl) hintEl.textContent = "";
        }
    }

    // ==================== STATE MUTATIONS ====================
    function setFlowerQty(id, qty) {
        qty = Math.max(0, Math.min(MAX_PER_FLOWER, qty));
        if (qty === 0) {
            delete state.flowers[id];
        } else {
            state.flowers[id] = qty;
        }
        renderFlowerGrid();
        renderSummary();
    }

    function setWrapping(id) {
        state.wrapping = id;
        renderWrappingGrid();
        renderSummary();
    }

    function setRibbon(id) {
        state.ribbon = id;
        renderRibbonGrid();
        renderSummary();
    }

    function updateCharCount() {
        const el = $("char-count");
        if (el) el.textContent = state.message.length;
    }

    function resetBuilder() {
        resetState();
        const msgEl = $("gift-message");
        if (msgEl) msgEl.value = "";
        renderFlowerGrid();
        renderWrappingGrid();
        renderRibbonGrid();
        renderSummary();
        updateCharCount();
    }

    // ==================== ADD TO CART ====================
    function pickHeroImage() {
        let bestId = null;
        let bestQty = 0;
        Object.keys(state.flowers).forEach(function (id) {
            if (state.flowers[id] > bestQty) {
                bestQty = state.flowers[id];
                bestId = id;
            }
        });
        if (bestId) {
            const f = FLOWERS.find(function (x) { return x.id === bestId; });
            if (f) return f.image;
        }
        return FLOWERS[0].image;
    }

    function buildSubtitle() {
        const parts = [];
        FLOWERS.forEach(function (f) {
            const qty = state.flowers[f.id] || 0;
            if (qty > 0) parts.push(qty + " " + f.name);
        });

        let flowerText = parts.slice(0, 3).join(" · ");
        if (parts.length > 3) flowerText += " +" + (parts.length - 3) + " more";

        const w = WRAPPINGS.find(function (x) { return x.id === state.wrapping; });
        const r = RIBBONS.find(function (x) { return x.id === state.ribbon; });
        return flowerText + " · " + w.name + " wrap · " + r.name + " ribbon";
    }

    function addToCart() {
        const stems = totalStems();
        if (stems < MIN_STEMS) return;
        if (!window.PetalCart) {
            console.error("[Builder] PetalCart module not loaded");
            return;
        }

        const product = {
            id: "custom_" + Date.now(),
            name: "Custom Bouquet",
            subtitle: buildSubtitle(),
            image: pickHeroImage(),
            price: grandTotal(),
        };

        window.PetalCart.addItem(product, 1);
    }

    // ==================== EVENT WIRING ====================
    // All listeners are bound to elements inside the view. When the router
    // swaps the view out, those elements and their listeners are collected —
    // nothing needs to be unbound manually.
    function wireEvents() {
        const flowerGrid = $("flower-grid");
        if (flowerGrid) {
            flowerGrid.addEventListener("click", function (e) {
                const inc = e.target.closest("[data-flower-inc]");
                if (inc) {
                    const id = inc.getAttribute("data-flower-inc");
                    const current = state.flowers[id] || 0;
                    if (current < MAX_PER_FLOWER) setFlowerQty(id, current + 1);
                    return;
                }
                const dec = e.target.closest("[data-flower-dec]");
                if (dec) {
                    const id = dec.getAttribute("data-flower-dec");
                    const current = state.flowers[id] || 0;
                    if (current > 0) setFlowerQty(id, current - 1);
                }
            });
        }

        const wrappingGrid = $("wrapping-grid");
        if (wrappingGrid) {
            wrappingGrid.addEventListener("click", function (e) {
                const btn = e.target.closest("[data-wrapping-id]");
                if (btn) setWrapping(btn.getAttribute("data-wrapping-id"));
            });
        }

        const ribbonGrid = $("ribbon-grid");
        if (ribbonGrid) {
            ribbonGrid.addEventListener("click", function (e) {
                const btn = e.target.closest("[data-ribbon-id]");
                if (btn) setRibbon(btn.getAttribute("data-ribbon-id"));
            });
        }

        const msgEl = $("gift-message");
        if (msgEl) {
            msgEl.addEventListener("input", function () {
                state.message = msgEl.value.slice(0, MAX_MESSAGE);
                updateCharCount();
            });
        }

        const addBtn = $("add-to-cart-btn");
        if (addBtn) addBtn.addEventListener("click", addToCart);

        const resetBtn = $("reset-btn");
        if (resetBtn) resetBtn.addEventListener("click", resetBuilder);
    }

    // ==================== BOOTSTRAP ====================
    function initBuilder() {
        // Guard: this script is included on every page, but only does
        // anything when the builder view is currently mounted.
        if (!$("flower-grid")) return;

        resetState();
        renderFlowerGrid();
        renderWrappingGrid();
        renderRibbonGrid();
        renderSummary();
        updateCharCount();
        wireEvents();
    }

    document.addEventListener("DOMContentLoaded", initBuilder);
    document.addEventListener("petal:view-loaded", initBuilder);
})();