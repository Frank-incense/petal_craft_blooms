/**
 * Petal Craft Blooms — Cart module
 * Phase 3: shared cart state, drawer UI, badge, localStorage persistence.
 *
 * Exposes: window.PetalCart
 * Emits:   "petal:cart-updated" on document
 */

(function () {
    "use strict";

    const STORAGE_KEY = "petal_craft_cart";
    const MAX_QTY = 99;
    let closeTimer = null;

    // ==================== STORAGE ====================
    function readCart() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function writeCart(items) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        document.dispatchEvent(new CustomEvent("petal:cart-updated", {
            detail: { items: items }
        }));
    }

    // ==================== HELPERS ====================
    function formatKES(amount) {
        return "KES " + Number(amount).toLocaleString("en-KE");
    }
    
    // Free-delivery threshold — must stay in sync with js/checkout.js
    const FREE_DELIVERY_THRESHOLD = 5000;

    function renderCartDeliveryHint() {
        const el = document.getElementById("cart-delivery-hint");
        if (!el) return;

        const sub = PetalCart.subtotal();

        if (sub <= 0) {
            el.className = "text-[11px] mb-3";
            el.textContent = "";
            return;
        }

        if (sub >= FREE_DELIVERY_THRESHOLD) {
            el.className = "text-[11px] mb-3 text-sage-dark font-medium";
            el.textContent = "\uD83C\uDF89 Free delivery unlocked";
            return;
        }

        const remaining = FREE_DELIVERY_THRESHOLD - sub;
        el.className = "text-[11px] mb-3 text-stone";
        el.textContent = "Add " + formatKES(remaining) + " more for free delivery";
    }

    function shopHref() {
        // SPA: route through the hash router — no page reload.
        return "#/shop";
    }
    function showToast(message) {
        let toast = document.getElementById("pc-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "pc-toast";
            toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 bg-forest text-ivory text-sm font-medium px-5 py-3 rounded-full shadow-lg z-[200] transition-opacity duration-300 opacity-0 pointer-events-none";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.remove("opacity-0");
        clearTimeout(toast._timer);
        toast._timer = setTimeout(function () {
            toast.classList.add("opacity-0");
        }, 2200);
    }

    // ==================== PUBLIC STORE API ====================
    const PetalCart = {
        items: readCart,

        count: function () {
            return readCart().reduce(function (sum, item) {
                return sum + (item.quantity || 0);
            }, 0);
        },

        subtotal: function () {
            return readCart().reduce(function (sum, item) {
                return sum + (item.unitPrice || 0) * (item.quantity || 0);
            }, 0);
        },

        addItem: function (product, quantity) {
            if (!product || !product.id) return;
            quantity = Math.max(1, Math.min(MAX_QTY, Number(quantity) || 1));

            const items = readCart();
            const existing = items.find(function (i) {
                return i.productId === product.id;
            });

            if (existing) {
                existing.quantity = Math.min(MAX_QTY, existing.quantity + quantity);
            } else {
                const line = {
                    productId: product.id,
                    name: product.name,
                    subtitle: product.subtitle || "",
                    image: product.image,
                    quantity: quantity,
                    unitPrice: product.price,
                    addedAt: Date.now(),
                };
                if (product.custom) line.custom = product.custom;
                items.push(line);
            }
            writeCart(items);
            showToast("Added to cart — " + product.name);
        },

        removeItem: function (productId) {
            const items = readCart().filter(function (i) {
                return i.productId !== productId;
            });
            writeCart(items);
        },

        updateQuantity: function (productId, quantity) {
            quantity = Math.max(1, Math.min(MAX_QTY, Number(quantity) || 1));
            const items = readCart();
            const item = items.find(function (i) {
                return i.productId === productId;
            });
            if (!item) return;
            item.quantity = quantity;
            writeCart(items);
        },

        clear: function () {
            writeCart([]);
        },

        /**
         * Bulk-updates unit prices for existing items. Used by checkout
         * to reconcile with authoritative server prices after a preflight.
         * priceMap: { productId: newPrice, … }
         * Silently ignores ids not in the cart.
         */
        updatePrices: function (priceMap) {
            if (!priceMap || typeof priceMap !== "object") return;
            const items = readCart();
            let changed = false;
            items.forEach(function (item) {
                const newPrice = priceMap[item.productId];
                if (typeof newPrice === "number" && newPrice !== item.unitPrice) {
                    item.unitPrice = newPrice;
                    changed = true;
                }
            });
            if (changed) writeCart(items);
        },

        open: function () {
            const drawer = document.getElementById("cart-drawer");
            const panel = document.getElementById("cart-panel");
            if (!drawer || !panel) return;

            // Cancel any pending "invisible" timer from a previous close.
            if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = null;
            }

            updateBadge();
            renderDrawer();

            drawer.classList.remove("invisible", "opacity-0");
            void panel.offsetHeight;
            panel.classList.remove("translate-x-full");
            panel.classList.add("translate-x-0");
            document.body.style.overflow = "hidden";
        },

        close: function () {
            const drawer = document.getElementById("cart-drawer");
            const panel = document.getElementById("cart-panel");
            if (!drawer || !panel) return;

            panel.classList.add("translate-x-full");
            panel.classList.remove("translate-x-0");
            drawer.classList.add("opacity-0");

            if (closeTimer) clearTimeout(closeTimer);
            closeTimer = setTimeout(function () {
                drawer.classList.add("invisible");
                closeTimer = null;
            }, 300);

            document.body.style.overflow = "";
        },

        refresh: function () {
            updateBadge();
            renderDrawer();
        },

        formatKES: formatKES,
    };

    // ==================== DRAWER INJECTION ====================
    function injectDrawer() {
        if (document.getElementById("cart-drawer")) return;

        const html =
            '<div id="cart-drawer" class="fixed inset-0 z-[150] invisible opacity-0 transition-opacity duration-300" role="dialog" aria-modal="true" aria-label="Shopping cart">' +
                '<div id="cart-backdrop" class="absolute inset-0 bg-charcoal/50 backdrop-blur-sm"></div>' +
                '<aside id="cart-panel" class="absolute right-0 top-0 h-full w-full max-w-md bg-ivory shadow-2xl flex flex-col translate-x-full transition-transform duration-300 ease-out">' +
                    '<header class="flex items-center justify-between px-5 py-4 border-b border-beige">' +
                        '<div>' +
                            '<h2 class="font-display text-xl font-medium text-forest">Your Cart</h2>' +
                            '<p id="cart-count-label" class="text-xs text-stone mt-0.5">0 items</p>' +
                        '</div>' +
                        '<button id="cart-close" aria-label="Close cart" class="w-9 h-9 rounded-full hover:bg-cream text-forest flex items-center justify-center transition-colors">' +
                            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
                        '</button>' +
                    '</header>' +
                    '<div id="cart-items" class="flex-1 overflow-y-auto px-5"></div>' +
                    '<footer id="cart-footer" class="hidden border-t border-beige px-5 py-4 bg-cream/50">' +
                        '<div class="flex items-center justify-between mb-2">' +
                            '<span class="text-sm text-stone">Subtotal</span>' +
                            '<span id="cart-subtotal" class="font-semibold text-forest text-lg">KES 0</span>' +
                        '</div>' +
                        '<p id="cart-delivery-hint" class="text-[11px] mb-3"></p>' +
                        '<button id="cart-checkout" class="w-full py-3 bg-forest text-ivory font-medium text-sm rounded-md hover:bg-forest-light transition-colors">' +
                            'Proceed to Checkout' +
                        '</button>' +
                    '</footer>' +
                '</aside>' +
            '</div>';

        document.body.insertAdjacentHTML("beforeend", html);

        document.getElementById("cart-close").addEventListener("click", PetalCart.close);
        document.getElementById("cart-backdrop").addEventListener("click", PetalCart.close);
        document.getElementById("cart-items").addEventListener("click", handleDrawerClick);
        document.getElementById("cart-checkout").addEventListener("click", function () {
            if (PetalCart.count() === 0) {
                showToast("Your cart is empty");
                return;
            }
            PetalCart.close();
            if (window.PetalRouter && typeof window.PetalRouter.navigate === "function") {
                window.PetalRouter.navigate("/checkout");
            } else {
                // Fallback if the router isn't loaded for some reason
                window.location.hash = "#/checkout";
            }
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") PetalCart.close();
        });
    }

    function handleDrawerClick(e) {
        const removeBtn = e.target.closest("[data-cart-remove]");
        if (removeBtn) {
            PetalCart.removeItem(removeBtn.getAttribute("data-cart-remove"));
            return;
        }

        const incBtn = e.target.closest("[data-cart-inc]");
        if (incBtn) {
            const id = incBtn.getAttribute("data-cart-inc");
            const item = readCart().find(function (i) { return i.productId === id; });
            if (item) PetalCart.updateQuantity(id, item.quantity + 1);
            return;
        }

        const decBtn = e.target.closest("[data-cart-dec]");
        if (decBtn) {
            const id = decBtn.getAttribute("data-cart-dec");
            const item = readCart().find(function (i) { return i.productId === id; });
            if (item && item.quantity > 1) PetalCart.updateQuantity(id, item.quantity - 1);
            return;
        }
    }

    // ==================== RENDER ====================
    function updateBadge() {
        const badge = document.getElementById("cart-badge");
        if (!badge) return;
        badge.textContent = PetalCart.count();
    }

    function renderDrawer() {
        const container = document.getElementById("cart-items");
        const footer = document.getElementById("cart-footer");
        const countLabel = document.getElementById("cart-count-label");
        if (!container || !footer) return;

        const items = readCart();
        const count = PetalCart.count();

        if (countLabel) {
            countLabel.textContent = count + (count === 1 ? " item" : " items");
        }

        if (!items.length) {
            footer.classList.add("hidden");
            container.innerHTML = emptyStateHTML();
            return;
        }

        footer.classList.remove("hidden");
        container.innerHTML = items.map(itemHTML).join("");

            const subtotalEl = document.getElementById("cart-subtotal");
        if (subtotalEl) subtotalEl.textContent = formatKES(PetalCart.subtotal());

        renderCartDeliveryHint();
    }

    function itemHTML(item) {
        const line = formatKES(item.unitPrice * item.quantity);
        const canDec = item.quantity > 1;

        return (
            '<div class="flex gap-4 py-4 border-b border-beige/60 last:border-b-0">' +
                '<div class="w-20 h-20 rounded-lg overflow-hidden bg-cream flex-shrink-0">' +
                    '<img src="' + item.image + '" alt="' + item.name + '" class="w-full h-full object-cover" loading="lazy" />' +
                '</div>' +
                '<div class="flex-1 min-w-0">' +
                    '<div class="flex items-start justify-between gap-2">' +
                        '<h3 class="font-display text-sm font-medium text-forest leading-tight pr-2">' + item.name + '</h3>' +
                        '<button data-cart-remove="' + item.productId + '" aria-label="Remove" class="text-stone hover:text-rose text-xs leading-none pt-0.5 flex-shrink-0 transition-colors">✕</button>' +
                    '</div>' +
                        (item.subtitle
                        ? '<p class="text-[11px] text-stone/90 mt-1 leading-snug">' + item.subtitle + '</p>'
                        : '') +
                    '<p class="text-[11px] text-stone mt-1">' + formatKES(item.unitPrice) + ' each</p>' +
                    '<div class="flex items-center justify-between mt-3">' +
                        '<div class="inline-flex items-center border border-beige rounded-md overflow-hidden">' +
                            '<button data-cart-dec="' + item.productId + '" aria-label="Decrease" class="w-7 h-7 flex items-center justify-center text-forest text-sm ' + (canDec ? "hover:bg-cream" : "opacity-40 cursor-not-allowed") + '">−</button>' +
                            '<span class="w-8 h-7 flex items-center justify-center text-xs font-medium text-forest border-x border-beige">' + item.quantity + '</span>' +
                            '<button data-cart-inc="' + item.productId + '" aria-label="Increase" class="w-7 h-7 flex items-center justify-center text-forest text-sm hover:bg-cream">+</button>' +
                        '</div>' +
                        '<span class="text-forest font-semibold text-sm">' + line + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    function emptyStateHTML() {
        return (
            '<div class="flex flex-col items-center justify-center py-20 px-4 text-center">' +
                '<div class="w-20 h-20 rounded-full bg-cream flex items-center justify-center mb-4">' +
                    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-sage">' +
                        '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>' +
                        '<line x1="3" y1="6" x2="21" y2="6"/>' +
                        '<path d="M16 10a4 4 0 0 1-8 0"/>' +
                    '</svg>' +
                '</div>' +
                '<h3 class="font-display text-lg text-forest mb-1">Your cart is empty</h3>' +
                '<p class="text-stone text-sm mb-5 max-w-xs">Add some beautiful flowers to get started.</p>' +
                '<a href="' + shopHref() + '" data-cart-open-close class="inline-flex items-center justify-center px-5 py-2.5 bg-forest text-ivory text-sm font-medium rounded-md hover:bg-forest-light transition-colors">' +
                    'Shop Flowers' +
                '</a>' +
            '</div>'
        );
    }

    function refresh() {
        updateBadge();
        renderDrawer();
    }

    // ==================== OPEN TRIGGERS ====================
    function bindOpenTriggers() {
        document.querySelectorAll("[data-cart-open]").forEach(function (el) {
            if (el._pcCartBound) return;
            el._pcCartBound = true;
            el.addEventListener("click", function (e) {
                e.preventDefault();
                PetalCart.open();
            });
        });
    }

    // ==================== BOOTSTRAP ====================
    // cart.js is loaded at the end of <body>, so the DOM is already parsed.
    // We initialise immediately rather than waiting for DOMContentLoaded —
    // that event does not re-fire on bfcache restores.
    function initCart() {
        injectDrawer();
        bindOpenTriggers();
        refresh();

        // Re-render whenever the cart data changes, from any code path.
        document.addEventListener("petal:cart-updated", function () {
            updateBadge();
            renderDrawer();
        });

        // Empty-state link should close the drawer before navigating.
        document.body.addEventListener("click", function (e) {
            if (e.target.closest("[data-cart-open-close]")) {
                PetalCart.close();
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initCart);
    } else {
        initCart();
    }

    // pageshow fires on every page display — including bfcache restores,
    // where DOMContentLoaded does not. Guarantees the badge is fresh after
    // back/forward navigation between home and shop.
    window.addEventListener("pageshow", function () {
        updateBadge();
        renderDrawer();
    });

    // Re-sync when the tab becomes visible (covers backgrounding, alt-tab, etc.)
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            updateBadge();
            renderDrawer();
        }
    });

    // Keep badge + drawer in sync when another tab modifies the cart.
    window.addEventListener("storage", function (e) {
        if (e.key === STORAGE_KEY) refresh();
    });

    // ==================== EXPORT ====================
    // SPA: close the drawer whenever the route changes.
    // Handles browser Back/Forward while the drawer is open, and
    // any future navigation triggered from inside the drawer.
    document.addEventListener("petal:view-loaded", function () {
        PetalCart.close();
    });
    window.PetalCart = PetalCart;
})();