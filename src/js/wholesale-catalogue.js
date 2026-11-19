/**
 * Petal Craft Blooms — Wholesale catalogue view
 * Phase W1: filters, table, pagination. No cart yet (W2).
 */

(function () {
    "use strict";

    const PAGE_SIZE = 50;

    const state = {
        search: "",
        category: "all",
        colour: "all",
        length: "all",
        sort: "price-asc",
        visible: PAGE_SIZE,
    };

    function $(id) { return document.getElementById(id); }

    // ==================== FILTER POPULATION ====================
    function populateFilters() {
        const catSel = $("w-category");
        const colSel = $("w-colour");
        const lenSel = $("w-length");
        if (!catSel || !colSel || !lenSel) return;

        const cat = window.PetalWholesaleCatalog.Catalog;
        const USD = window.PetalWholesaleCatalog;

        // Categories
        while (catSel.options.length > 1) catSel.remove(1);
        cat.categories().forEach(function (c) {
            const opt = document.createElement("option");
            opt.value = c.key;
            opt.textContent = c.label;
            catSel.appendChild(opt);
        });

        // Colours
        while (colSel.options.length > 1) colSel.remove(1);
        cat.colours().forEach(function (c) {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            colSel.appendChild(opt);
        });

        // Lengths
        while (lenSel.options.length > 1) lenSel.remove(1);
        cat.lengths().forEach(function (len) {
            const opt = document.createElement("option");
            opt.value = String(len);
            opt.textContent = len + "cm";
            lenSel.appendChild(opt);
        });
        void USD;
    }

    // ==================== QUERY ====================
    function getFiltered() {
        const opts = {
            search: state.search,
            category: state.category,
            colour: state.colour,
        };
        if (state.length !== "all") {
            const len = Number(state.length);
            opts.lengthMin = len;
            opts.lengthMax = len;
        }

        const list = window.PetalWholesaleCatalog.Catalog.filter(opts);
        const sorted = list.slice();

        switch (state.sort) {
            case "price-asc":   sorted.sort(function (a, b) { return a.pricePerStem - b.pricePerStem; }); break;
            case "price-desc":  sorted.sort(function (a, b) { return b.pricePerStem - a.pricePerStem; }); break;
            case "variety":     sorted.sort(function (a, b) { return a.variety.localeCompare(b.variety); }); break;
            case "length-asc":  sorted.sort(function (a, b) { return a.lengthCm - b.lengthCm; }); break;
            case "length-desc": sorted.sort(function (a, b) { return b.lengthCm - a.lengthCm; }); break;
        }
        return sorted;
    }

    // ==================== RENDER ====================
    function rowHTML(sku) {
        const USD = window.PetalWholesaleCatalog;
        return (
            '<tr data-sku-id="' + sku.id + '" class="hover:bg-cream/40 transition-colors">' +
                '<td class="px-4 py-3">' +
                    '<p class="text-sm font-medium text-forest leading-tight">' + sku.variety + '</p>' +
                    '<p class="text-[10px] font-mono text-stone mt-0.5">' + sku.id + '</p>' +
                '</td>' +
                '<td class="px-4 py-3 hidden md:table-cell text-stone text-xs">' + sku.colour + '</td>' +
                '<td class="px-4 py-3 hidden lg:table-cell text-stone text-xs">' + sku.categoryLabel + '</td>' +
                '<td class="px-4 py-3 text-right text-forest text-sm font-medium">' + sku.lengthCm + 'cm</td>' +
                '<td class="px-4 py-3 text-right text-forest font-semibold">' + USD.formatUSD(sku.pricePerStem) + '</td>' +
                '<td class="px-4 py-3 text-right text-stone text-xs hidden sm:table-cell">' + sku.skuMinStems + '</td>' +
                '<td class="px-4 py-3 text-right">' +
                    '<input type="number" min="' + sku.skuMinStems + '" step="' + sku.skuMinStems + '" ' +
                        'value="' + sku.skuMinStems + '" ' +
                        'class="w-24 px-2 py-1.5 bg-ivory border border-beige rounded text-sm text-right text-charcoal focus:outline-none focus:border-sage focus:ring-1 focus:ring-sage" />' +
                '</td>' +
                '<td class="px-4 py-3 text-right">' +
                    '<button type="button" data-add-sku="' + sku.id + '" ' +
                        'class="px-3 py-1.5 bg-forest text-ivory text-xs font-medium rounded hover:bg-forest-light transition-colors">' +
                        'Add' +
                    '</button>' +
                '</td>' +
            '</tr>'
        );
    }

    function renderTable() {
        const tbody = $("w-tbody");
        const emptyEl = $("w-empty");
        const countEl = $("w-count");
        const loadMoreBtn = $("w-load-more");
        if (!tbody) return;

        const all = getFiltered();
        const visible = all.slice(0, state.visible);

        if (!all.length) {
            tbody.innerHTML = "";
            emptyEl.classList.remove("hidden");
            countEl.textContent = "0 SKUs";
            loadMoreBtn.classList.add("hidden");
            return;
        }

        emptyEl.classList.add("hidden");
        tbody.innerHTML = visible.map(rowHTML).join("");
        countEl.textContent = "Showing " + visible.length + " of " + all.length + " SKUs";

        if (all.length > visible.length) {
            loadMoreBtn.classList.remove("hidden");
            loadMoreBtn.textContent = "Load " + Math.min(PAGE_SIZE, all.length - visible.length) + " more";
        } else {
            loadMoreBtn.classList.add("hidden");
        }
    }

    // ==================== TOAST ====================
    function showToast(message) {
        let toast = document.getElementById("w-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "w-toast";
            toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 bg-forest text-ivory text-sm font-medium px-5 py-3 rounded-full shadow-lg z-[200] transition-opacity duration-300 opacity-0 pointer-events-none";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.remove("opacity-0");
        clearTimeout(toast._t);
        toast._t = setTimeout(function () {
            toast.classList.add("opacity-0");
        }, 2200);
    }

    // ==================== EVENTS ====================
    let debounceId;

    function wireEvents() {
        const search = $("w-search");
        const catSel = $("w-category");
        const colSel = $("w-colour");
        const lenSel = $("w-length");
        const sortSel = $("w-sort");
        const clearBtn = $("w-clear");
        const loadMoreBtn = $("w-load-more");
        const tbody = $("w-tbody");

        if (search) {
            search.addEventListener("input", function () {
                clearTimeout(debounceId);
                debounceId = setTimeout(function () {
                    state.search = search.value;
                    state.visible = PAGE_SIZE;
                    renderTable();
                }, 180);
            });
        }
        if (catSel) catSel.addEventListener("change", function () { state.category = catSel.value; state.visible = PAGE_SIZE; renderTable(); });
        if (colSel) colSel.addEventListener("change", function () { state.colour = colSel.value; state.visible = PAGE_SIZE; renderTable(); });
        if (lenSel) lenSel.addEventListener("change", function () { state.length = lenSel.value; state.visible = PAGE_SIZE; renderTable(); });
        if (sortSel) sortSel.addEventListener("change", function () { state.sort = sortSel.value; state.visible = PAGE_SIZE; renderTable(); });

        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                state.search = ""; state.category = "all"; state.colour = "all";
                state.length = "all"; state.sort = "price-asc"; state.visible = PAGE_SIZE;
                if (search) search.value = "";
                if (catSel) catSel.value = "all";
                if (colSel) colSel.value = "all";
                if (lenSel) lenSel.value = "all";
                if (sortSel) sortSel.value = "price-asc";
                renderTable();
            });
        }

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener("click", function () {
                state.visible += PAGE_SIZE;
                renderTable();
            });
        }

        if (tbody) {
            tbody.addEventListener("click", function (e) {
                const btn = e.target.closest("[data-add-sku]");
                if (!btn) return;
                const id = btn.getAttribute("data-add-sku");
                const sku = window.PetalWholesaleCatalog.Catalog.byId(id);
                if (!sku) return;

                const row = btn.closest("tr");
                const input = row ? row.querySelector("input[type=number]") : null;
                const qty = input ? Number(input.value) : 0;

                const result = window.PetalWholesaleCart.addItem(sku, qty);
                if (!result.ok) {
                    window.PetalWholesaleCart.toast(result.message);
                    return;
                }
                window.PetalWholesaleCart.toast(
                    "Added " + qty + " × " + sku.variety + " " + sku.lengthCm + "cm"
                );
            });
        }
    }

    // ==================== BOOTSTRAP ====================
    function init() {
        window.PetalWholesaleCart.refreshBadges();
        if (!$("w-tbody")) return;

        state.search = ""; state.category = "all"; state.colour = "all";
        state.length = "all"; state.sort = "price-asc"; state.visible = PAGE_SIZE;

        populateFilters();
        wireEvents();
        renderTable();
    }

    document.addEventListener("DOMContentLoaded", init);
    document.addEventListener("petal:view-loaded", init);
})();