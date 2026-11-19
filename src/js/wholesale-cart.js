/**
 * Petal Craft Blooms — Wholesale cart
 * Phase W2: separate B2B cart, MOQ enforcement, volume discounts.
 * Storage: petal_craft_wholesale_cart (isolated from retail cart).
 * Exposes: window.PetalWholesaleCart
 */

(function () {
    "use strict";

    const STORAGE_KEY = "petal_craft_wholesale_cart";
    const MAX_QTY_PER_LINE = 100000;

    function readCart() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    }

    function writeCart(items) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        document.dispatchEvent(new CustomEvent("petal:wholesale-cart-updated", {
            detail: { items: items }
        }));
    }

    function formatUSD(amount) {
        return window.PetalWholesaleCatalog
            ? window.PetalWholesaleCatalog.formatUSD(amount)
            : "$" + Number(amount).toFixed(2);
    }

    // ==================== DISCOUNT LOGIC ====================
    function discountRateFor(totalStems) {
        const tiers = window.PetalWholesaleCatalog.VOLUME_DISCOUNTS;
        for (let i = 0; i < tiers.length; i++) {
            if (totalStems >= tiers[i].minStems) return tiers[i].discount;
        }
        return 0;
    }

    function nextTierFor(totalStems) {
        const tiers = window.PetalWholesaleCatalog.VOLUME_DISCOUNTS;
        // Tiers are sorted descending; find the highest one above current
        const sorted = tiers.slice().sort(function (a, b) { return a.minStems - b.minStems; });
        for (let i = 0; i < sorted.length; i++) {
            if (totalStems < sorted[i].minStems) return sorted[i];
        }
        return null;
    }

    // ==================== PUBLIC API ====================
    const PetalWholesaleCart = {
        items: readCart,

        count: function () {
            return readCart().length;
        },

        totalStems: function () {
            return readCart().reduce(function (sum, item) {
                return sum + (item.quantity || 0);
            }, 0);
        },

        subtotalUSD: function () {
            return readCart().reduce(function (sum, item) {
                return sum + (item.pricePerStem || 0) * (item.quantity || 0);
            }, 0);
        },

        discountRate: function () {
            return discountRateFor(PetalWholesaleCart.totalStems());
        },

        discountAmountUSD: function () {
            return PetalWholesaleCart.subtotalUSD() * PetalWholesaleCart.discountRate();
        },

        grandTotalUSD: function () {
            return PetalWholesaleCart.subtotalUSD() - PetalWholesaleCart.discountAmountUSD();
        },

        nextTier: function () {
            return nextTierFor(PetalWholesaleCart.totalStems());
        },

        meetsOrderMinimum: function () {
            return PetalWholesaleCart.totalStems() >= window.PetalWholesaleCatalog.ORDER_MIN_STEMS;
        },

        // ---- mutations ----
        addItem: function (sku, quantity) {
            if (!sku || !sku.id) return { ok: false, message: "Invalid SKU" };
            const min = sku.skuMinStems || window.PetalWholesaleCatalog.SKU_MIN_STEMS;

            const qty = Math.floor(Number(quantity) || 0);
            if (qty < min) {
                return { ok: false, message: "Minimum " + min + " stems per SKU" };
            }
            if (qty % min !== 0) {
                return { ok: false, message: "Quantity must be a multiple of " + min + " stems" };
            }
            if (qty > MAX_QTY_PER_LINE) {
                return { ok: false, message: "Maximum " + MAX_QTY_PER_LINE + " stems per SKU" };
            }

            const items = readCart();
            const existing = items.find(function (i) { return i.skuId === sku.id; });

            if (existing) {
                const combined = existing.quantity + qty;
                if (combined > MAX_QTY_PER_LINE) {
                    return { ok: false, message: "Combined quantity exceeds " + MAX_QTY_PER_LINE + " stems" };
                }
                existing.quantity = combined;
            } else {
                items.push({
                    skuId: sku.id,
                    variety: sku.variety,
                    colour: sku.colour,
                    categoryLabel: sku.categoryLabel,
                    lengthCm: sku.lengthCm,
                    pricePerStem: sku.pricePerStem,
                    skuMinStems: min,
                    quantity: qty,
                    addedAt: Date.now(),
                });
            }
            writeCart(items);
            return { ok: true };
        },

        removeItem: function (skuId) {
            const items = readCart().filter(function (i) { return i.skuId !== skuId; });
            writeCart(items);
        },

        updateQuantity: function (skuId, quantity) {
            const items = readCart();
            const item = items.find(function (i) { return i.skuId === skuId; });
            if (!item) return { ok: false, message: "Item not in cart" };

            const min = item.skuMinStems || 100;
            const qty = Math.floor(Number(quantity) || 0);

            if (qty < min) return { ok: false, message: "Minimum " + min + " stems" };
            if (qty % min !== 0) return { ok: false, message: "Must be a multiple of " + min };
            if (qty > MAX_QTY_PER_LINE) return { ok: false, message: "Too many stems" };

            item.quantity = qty;
            writeCart(items);
            return { ok: true };
        },

        clear: function () {
            writeCart([]);
        },

        // ---- UI helpers ----
        refreshBadges: function () {
            const n = PetalWholesaleCart.count();
            document.querySelectorAll("[data-wholesale-cart-count]").forEach(function (el) {
                el.textContent = n;
            });
        },

        toast: function (message) {
            let toast = document.getElementById("wc-toast");
            if (!toast) {
                toast = document.createElement("div");
                toast.id = "wc-toast";
                toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 bg-forest text-ivory text-sm font-medium px-5 py-3 rounded-full shadow-lg z-[200] transition-opacity duration-300 opacity-0 pointer-events-none";
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            toast.classList.remove("opacity-0");
            clearTimeout(toast._t);
            toast._t = setTimeout(function () {
                toast.classList.add("opacity-0");
            }, 2600);
        },

        formatUSD: formatUSD,
    };

    // Keep badges in sync whenever the cart changes (from any view)
    document.addEventListener("petal:wholesale-cart-updated", function () {
        PetalWholesaleCart.refreshBadges();
    });
    document.addEventListener("DOMContentLoaded", function () {
        PetalWholesaleCart.refreshBadges();
    });
    document.addEventListener("petal:view-loaded", function () {
        PetalWholesaleCart.refreshBadges();
    });

    window.PetalWholesaleCart = PetalWholesaleCart;
})();

/**
 * Petal Craft Blooms — Wholesale cart view
 * Renders line items, MOQ progress, discount tiers, totals.
 */

(function () {
    "use strict";

    function $(id) { return document.getElementById(id); }
    function usd(n) { return window.PetalWholesaleCart.formatUSD(n); }

    // ==================== RENDER ====================
    function rowHTML(item) {
        const lineTotal = item.pricePerStem * item.quantity;
        return (
            '<tr data-sku-id="' + item.skuId + '" class="hover:bg-cream/30 transition-colors">' +
                '<td class="px-4 py-3">' +
                    '<p class="text-sm font-medium text-forest leading-tight">' + item.variety + '</p>' +
                    '<p class="text-[10px] font-mono text-stone mt-0.5">' + item.skuId + '</p>' +
                    '<p class="text-[11px] text-stone mt-0.5">' + item.colour + ' · ' + item.categoryLabel + '</p>' +
                '</td>' +
                '<td class="px-4 py-3 text-right text-forest text-sm hidden sm:table-cell">' + item.lengthCm + 'cm</td>' +
                '<td class="px-4 py-3 text-right text-stone text-xs hidden md:table-cell">' + usd(item.pricePerStem) + '</td>' +
                '<td class="px-4 py-3 text-right">' +
                    '<input type="number" data-qty-for="' + item.skuId + '" ' +
                        'min="' + item.skuMinStems + '" step="' + item.skuMinStems + '" ' +
                        'value="' + item.quantity + '" ' +
                        'class="w-24 px-2 py-1.5 bg-ivory border border-beige rounded text-sm text-right text-charcoal focus:outline-none focus:border-sage focus:ring-1 focus:ring-sage" />' +
                '</td>' +
                '<td class="px-4 py-3 text-right text-forest font-semibold text-sm whitespace-nowrap">' + usd(lineTotal) + '</td>' +
                '<td class="px-4 py-3 text-right">' +
                    '<button type="button" data-remove-sku="' + item.skuId + '" aria-label="Remove" class="text-stone hover:text-rose text-xs leading-none transition-colors">✕</button>' +
                '</td>' +
            '</tr>'
        );
    }

    function renderContent() {
        const cart = window.PetalWholesaleCart;
        const items = cart.items();

        if (!items.length) {
            $("wc-content").classList.add("hidden");
            $("wc-empty").classList.remove("hidden");
            return;
        }
        $("wc-empty").classList.add("hidden");
        $("wc-content").classList.remove("hidden");

        $("wc-tbody").innerHTML = items.map(rowHTML).join("");

        renderMinimum(cart);
        renderDiscount(cart);
        renderTotals(cart);
    }

    function renderMinimum(cart) {
        const stems = cart.totalStems();
        const target = window.PetalWholesaleCatalog.ORDER_MIN_STEMS;
        const met = stems >= target;
        const pct = Math.min(100, Math.round((stems / target) * 100));

        $("wc-total-stems").textContent = stems.toLocaleString();
        $("wc-min-bar").style.width = pct + "%";

        const statusEl = $("wc-min-status");
        const hintEl = $("wc-min-hint");
        if (met) {
            statusEl.className = "text-xs font-medium text-sage-dark";
            statusEl.textContent = "Met ✓";
            hintEl.textContent = "You can proceed to checkout.";
        } else {
            statusEl.className = "text-xs font-medium text-rose-dark";
            statusEl.textContent = "Not met";
            const remaining = target - stems;
            hintEl.textContent = "Add " + remaining.toLocaleString() + " more stems to proceed.";
        }
    }

    function renderDiscount(cart) {
        const rate = cart.discountRate();
        const pct = Math.round(rate * 100);
        const next = cart.nextTier();
        const stems = cart.totalStems();

        $("wc-discount-rate").textContent = pct + "%";

        const pillEl = $("wc-discount-pill");
        if (pct > 0) {
            pillEl.className = "text-xs font-medium text-sage-dark";
            pillEl.textContent = "Active ✓";
        } else {
            pillEl.className = "text-xs font-medium text-stone";
            pillEl.textContent = "Base price";
        }

        // Progress bar towards the next tier
        let barPct = 100;
        let hint = "";
        if (next) {
            const currentTierStart = (function () {
                // find the tier whose minStems we're currently at or above
                const tiers = window.PetalWholesaleCatalog.VOLUME_DISCOUNTS
                    .slice().sort(function (a, b) { return a.minStems - b.minStems; });
                let start = 0;
                tiers.forEach(function (t) { if (stems >= t.minStems) start = t.minStems; });
                return start;
            })();
            barPct = Math.min(100, Math.round(((stems - currentTierStart) / (next.minStems - currentTierStart)) * 100));
            const needed = next.minStems - stems;
            hint = "Add " + needed.toLocaleString() + " more stems to unlock " +
                   Math.round(next.discount * 100) + "% off.";
        } else {
            hint = "Maximum tier unlocked.";
        }

        $("wc-discount-bar").style.width = barPct + "%";
        $("wc-discount-hint").textContent = hint;
    }

    function renderTotals(cart) {
        const sub = cart.subtotalUSD();
        const rate = cart.discountRate();
        const discount = cart.discountAmountUSD();
        const total = cart.grandTotalUSD();

        $("wc-subtotal").textContent = usd(sub);
        $("wc-total").textContent = usd(total);

        const discountRow = $("wc-discount-row");
        if (rate > 0) {
            discountRow.classList.remove("hidden");
            $("wc-discount-pct").textContent = Math.round(rate * 100) + "%";
            $("wc-discount-amount").textContent = "−" + usd(discount);
        } else {
            discountRow.classList.add("hidden");
        }

        const btn = $("wc-checkout-btn");
        const hintEl = $("wc-checkout-hint");
        if (cart.meetsOrderMinimum()) {
            btn.disabled = false;
            hintEl.textContent = "";
        } else {
            btn.disabled = true;
            const remaining = window.PetalWholesaleCatalog.ORDER_MIN_STEMS - cart.totalStems();
            hintEl.textContent = "Add " + remaining.toLocaleString() + " more stems to continue.";
        }
    }

    // ==================== EVENTS ====================
    function wireEvents() {
        const tbody = $("wc-tbody");
        if (!tbody) return;

        tbody.addEventListener("click", function (e) {
            const removeBtn = e.target.closest("[data-remove-sku]");
            if (removeBtn) {
                window.PetalWholesaleCart.removeItem(removeBtn.getAttribute("data-remove-sku"));
                renderContent();
                return;
            }
        });

        // Quantity change — clamp on blur to avoid mid-typing jitter
        tbody.addEventListener("blur", function (e) {
            const input = e.target.closest("[data-qty-for]");
            if (!input) return;
            const skuId = input.getAttribute("data-qty-for");
            const raw = Number(input.value);
            const item = window.PetalWholesaleCart.items().find(function (i) { return i.skuId === skuId; });
            if (!item) return;

            const min = item.skuMinStems || 100;
            let qty = Math.floor(raw);
            if (!Number.isFinite(qty) || qty < min) qty = min;
            // Snap to nearest lower multiple of `min`
            qty = Math.max(min, Math.floor(qty / min) * min);

            const res = window.PetalWholesaleCart.updateQuantity(skuId, qty);
            if (!res.ok) {
                window.PetalWholesaleCart.toast(res.message);
                input.value = item.quantity;
                return;
            }
            renderContent();
        }, true);

        const clearBtn = $("wc-clear-cart");
        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                if (!window.confirm("Clear the entire wholesale order?")) return;
                window.PetalWholesaleCart.clear();
                renderContent();
            });
        }

        const checkoutBtn = $("wc-checkout-btn");
        if (checkoutBtn) {
            checkoutBtn.addEventListener("click", function () {
                window.PetalWholesaleCart.toast("Wholesale checkout arrives in Phase W3");
            });
        }
    }

    // ==================== BOOTSTRAP ====================
    function init() {
        if (!$("wc-content")) return;
        wireEvents();
        renderContent();
    }

    document.addEventListener("DOMContentLoaded", init);
    document.addEventListener("petal:view-loaded", init);
    document.addEventListener("petal:wholesale-cart-updated", function () {
        if ($("wc-content")) renderContent();
    });
})();