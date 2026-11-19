/**
 * Petal Craft Blooms — Checkout view (SPA)
 * Phase 5:  guest checkout, delivery details, live summary, mock submit.
 * Phase 8:  real order submission via Apps Script `createOrder`.
 * Phase 11B: M-Pesa STK Push, polling, retry, timeout handling.
 */

(function () {
    "use strict";

    // ==================== CONFIG ====================
    const DELIVERY_ZONES = [
        { id: "cbd",     name: "Nairobi CBD",     price: 300, eta: "Same day · 2–4 hours" },
        { id: "suburbs", name: "Nairobi Suburbs", price: 500, eta: "Same day · 3–6 hours" },
    ];

    const MAX_MESSAGE = 200;
    const FREE_DELIVERY_THRESHOLD = 5000;

    // M-Pesa polling
    const POLL_INTERVAL_MS = 3000;
    const PAYMENT_TIMEOUT_MS = 90000;

    // ==================== STATE ====================
    let zone = "cbd";
    let submitting = false;
    let cartListenerBound = false;
    let currentOrder = null;   // result of createOrder
    let poll = { intervalId: null, timeoutId: null, startedAt: 0 };

    // ==================== UTILITIES ====================
    function $(id) { return document.getElementById(id); }
    function kes(n) { return window.PetalCart.formatKES(n); }

    function getCart() {
        return window.PetalCart ? window.PetalCart.items() : [];
    }

    function subtotal() {
        return getCart().reduce(function (sum, item) {
            return sum + (item.unitPrice || 0) * (item.quantity || 0);
        }, 0);
    }

    function standardDeliveryFee() {
        const z = DELIVERY_ZONES.find(function (x) { return x.id === zone; });
        return z ? z.price : 0;
    }

    function qualifiesForFreeDelivery() {
        return subtotal() >= FREE_DELIVERY_THRESHOLD;
    }

    function deliveryFee() {
        if (qualifiesForFreeDelivery()) return 0;
        return standardDeliveryFee();
    }

    function grandTotal() {
        return subtotal() + deliveryFee();
    }

    function maskPhone(phone) {
        if (!phone) return "—";
        const s = String(phone).replace(/\s/g, "");
        if (s.length < 6) return s;
        return s.slice(0, 4) + " ••• " + s.slice(-3);
    }

    function stopPolling() {
        if (poll.intervalId) { clearInterval(poll.intervalId); poll.intervalId = null; }
        if (poll.timeoutId)  { clearTimeout(poll.timeoutId);  poll.timeoutId = null; }
        poll.startedAt = 0;
    }

    // ==================== SCREENS ====================
    function hideAll() {
        ["checkout-empty", "checkout-form-wrap", "checkout-success",
         "checkout-paying", "checkout-payment-failed"].forEach(function (id) {
            const el = $(id);
            if (el) el.classList.add("hidden");
        });
    }

    function showEmpty()          { hideAll(); $("checkout-empty").classList.remove("hidden"); }
    function showForm()           { hideAll(); $("checkout-form-wrap").classList.remove("hidden"); }
    function showSuccess()        { hideAll(); $("checkout-success").classList.remove("hidden"); }
    function showPaying()         { hideAll(); $("checkout-paying").classList.remove("hidden"); }
    function showPaymentFailed()  { hideAll(); $("checkout-payment-failed").classList.remove("hidden"); }

    // ==================== RENDER: ZONES ====================
    function renderZones() {
        const container = $("zone-options");
        if (!container) return;

        container.innerHTML = DELIVERY_ZONES.map(function (z) {
            const selected = zone === z.id;
            const cls = "flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors " +
                (selected
                    ? "border-forest bg-forest/5 ring-1 ring-forest"
                    : "border-beige bg-white hover:border-sage");
            return (
                '<label class="' + cls + '">' +
                    '<input type="radio" name="delivery-zone" value="' + z.id + '" ' +
                        (selected ? "checked" : "") + ' class="mt-1 accent-forest" />' +
                    '<span class="flex-1 min-w-0">' +
                        '<span class="block text-sm font-medium text-forest">' + z.name + '</span>' +
                        '<span class="block text-[11px] text-stone mt-0.5">' + z.eta + '</span>' +
                        '<span class="block text-xs font-semibold text-forest mt-1">' + kes(z.price) + '</span>' +
                    '</span>' +
                '</label>'
            );
        }).join("");
    }

    // ==================== RENDER: SUMMARY ====================
    function renderSummaryItems() {
        const el = $("checkout-summary-items");
        if (!el) return;
        const items = getCart();

        if (!items.length) {
            el.innerHTML = '<p class="text-stone text-sm italic text-center py-3">Your cart is empty.</p>';
            return;
        }

        el.innerHTML = items.map(function (item) {
            return (
                '<div class="flex gap-3 py-3 border-b border-beige/60 last:border-b-0">' +
                    '<div class="w-14 h-14 rounded-md overflow-hidden bg-cream flex-shrink-0">' +
                        '<img src="' + item.image + '" alt="" class="w-full h-full object-cover" loading="lazy" />' +
                    '</div>' +
                    '<div class="flex-1 min-w-0">' +
                        '<p class="text-sm font-medium text-forest leading-tight">' + item.name + '</p>' +
                        (item.subtitle
                            ? '<p class="text-[11px] text-stone leading-snug mt-0.5">' + item.subtitle + '</p>'
                            : '') +
                        '<p class="text-[11px] text-stone mt-1">' + item.quantity + ' × ' + kes(item.unitPrice) + '</p>' +
                    '</div>' +
                    '<div class="text-right flex-shrink-0">' +
                        '<p class="text-sm font-semibold text-forest">' + kes(item.unitPrice * item.quantity) + '</p>' +
                    '</div>' +
                '</div>'
            );
        }).join("");
    }

    function renderTotals() {
        const subEl = $("checkout-subtotal");
        const delEl = $("checkout-delivery");
        const totEl = $("checkout-total");

        if (subEl) subEl.textContent = kes(subtotal());

        if (delEl) {
            if (qualifiesForFreeDelivery()) {
                delEl.innerHTML =
                    '<span class="line-through text-stone text-xs mr-1.5">' + kes(standardDeliveryFee()) + '</span>' +
                    '<span class="text-sage-dark font-semibold">FREE</span>';
            } else {
                delEl.textContent = kes(deliveryFee());
            }
        }

        if (totEl) totEl.textContent = kes(grandTotal());
        renderFreeDeliveryBanner();
    }

    function renderFreeDeliveryBanner() {
        const bannerEl = $("free-delivery-banner");
        if (!bannerEl) return;

        const sub = subtotal();

        if (sub <= 0) {
            bannerEl.className = "hidden";
            bannerEl.innerHTML = "";
            return;
        }

        if (qualifiesForFreeDelivery()) {
            bannerEl.className = "rounded-lg bg-sage/20 border border-sage/40 px-3 py-2.5 mb-4 flex items-center gap-2 text-xs text-forest";
            bannerEl.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-sage-dark flex-shrink-0">' +
                    '<polyline points="20 6 9 17 4 12"/>' +
                '</svg>' +
                '<span class="font-medium">Free delivery unlocked</span>';
            return;
        }

        const remaining = FREE_DELIVERY_THRESHOLD - sub;
        const pct = Math.min(100, Math.round((sub / FREE_DELIVERY_THRESHOLD) * 100));
        bannerEl.className = "rounded-lg bg-cream border border-beige px-3 py-2.5 mb-4";
        bannerEl.innerHTML =
            '<p class="text-xs text-forest mb-1.5">' +
                'Add <span class="font-semibold">' + kes(remaining) + '</span> more for free delivery' +
            '</p>' +
            '<div class="h-1 rounded-full bg-beige overflow-hidden">' +
                '<div class="h-full bg-sage transition-all duration-300" style="width:' + pct + '%"></div>' +
            '</div>';
    }

    function renderAll() {
        renderZones();
        renderSummaryItems();
        renderTotals();
    }

    // ==================== HELPERS ====================
    function setMinDeliveryDate() {
        const dateEl = $("delivery-date");
        if (!dateEl) return;
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const iso = yyyy + "-" + mm + "-" + dd;
        dateEl.min = iso;
        if (!dateEl.value) dateEl.value = iso;
    }

    function wireCharCount() {
        const msgEl = $("gift-message");
        const countEl = $("checkout-char-count");
        if (!msgEl || !countEl) return;
        msgEl.addEventListener("input", function () {
            countEl.textContent = msgEl.value.length;
        });
    }

    function wireZoneChange() {
        const container = $("zone-options");
        if (!container) return;
        container.addEventListener("change", function (e) {
            const input = e.target.closest('input[name="delivery-zone"]');
            if (!input) return;
            zone = input.value;
            renderZones();
            renderTotals();
        });
    }

    // ==================== WARNING / ERROR BANNERS ====================
    function showWarning(html) {
        const el = $("checkout-warning");
        if (!el) return;
        el.className = "rounded-lg border border-rose/40 bg-rose/10 px-4 py-3";
        el.setAttribute("role", "alert");
        el.innerHTML = html;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function hideWarning() {
        const el = $("checkout-warning");
        if (!el) return;
        el.className = "hidden";
        el.innerHTML = "";
    }

    function showSubmitError(message) {
        showWarning(
            '<p class="text-sm font-medium text-rose-dark mb-1">We couldn\'t place your order</p>' +
            '<p class="text-xs text-stone">' + message + '</p>'
        );
    }

    function setSubmitButton(state) {
        const btn = $("place-order-btn");
        if (!btn) return;
        if (state === "checking") {
            btn.disabled = true;
            btn.textContent = "Checking prices…";
            btn.classList.add("cursor-wait");
        } else if (state === "submitting") {
            btn.disabled = true;
            btn.textContent = "Placing order…";
            btn.classList.add("cursor-wait");
        } else {
            btn.disabled = false;
            btn.textContent = "Place Order";
            btn.classList.remove("cursor-wait");
        }
    }

    // ==================== PAYLOAD / PREFLIGHT ====================
    function buildOrderPayload() {
        const form = $("checkout-form");
        const data = new FormData(form);
        return {
            customer_name:    (data.get("fullName") || "").toString().trim(),
            customer_phone:   (data.get("phone") || "").toString().trim(),
            customer_email:   (data.get("email") || "").toString().trim(),
            delivery_address: (data.get("address") || "").toString().trim(),
            delivery_zone:    zone,
            delivery_date:    (data.get("deliveryDate") || "").toString(),
            delivery_time:    (data.get("deliveryTime") || "").toString(),
            gift_message:     (data.get("giftMessage") || "").toString().trim(),
            payment_method:   "MPESA",
            items: getCart().map(function (item) {
                return {
                    productId: item.productId,
                    quantity:  item.quantity,
                    unitPrice: item.unitPrice,
                    name:      item.name,
                    subtitle:  item.subtitle || "",
                    custom:    item.custom,
                };
            }),
        };
    }

    async function preflightPrices() {
        const items = getCart();
        const realItems = items.filter(function (i) {
            return !i.productId.startsWith("custom_");
        });

        if (!realItems.length) return { ok: true, priceChanges: [], unavailable: [] };

        let fresh;
        try {
            fresh = await window.PetalApi.call("getProducts");
        } catch (err) {
            console.warn("[Checkout] Price preflight failed, proceeding anyway:", err.message);
            return { ok: true, priceChanges: [], unavailable: [], preflightFailed: true };
        }
        if (!Array.isArray(fresh)) {
            return { ok: true, priceChanges: [], unavailable: [], preflightFailed: true };
        }

        const freshById = {};
        fresh.forEach(function (p) { freshById[p.id] = p; });

        const priceChanges = [];
        const unavailable = [];
        const priceUpdates = {};

        realItems.forEach(function (item) {
            const current = freshById[item.productId];
            if (!current) {
                unavailable.push({ productId: item.productId, name: item.name });
                return;
            }
            if (current.price !== item.unitPrice) {
                priceChanges.push({
                    productId: item.productId,
                    name:      item.name,
                    oldPrice:  item.unitPrice,
                    newPrice:  current.price,
                });
                priceUpdates[item.productId] = current.price;
            }
        });

        if (Object.keys(priceUpdates).length) {
            window.PetalCart.updatePrices(priceUpdates);
        }

        return {
            ok: priceChanges.length === 0 && unavailable.length === 0,
            priceChanges: priceChanges,
            unavailable: unavailable,
        };
    }

    function renderPreflightWarning(result) {
        const lines = [];
        result.priceChanges.forEach(function (c) {
            lines.push(
                '<li>• <strong>' + c.name + '</strong>: ' +
                '<span class="line-through">' + kes(c.oldPrice) + '</span> → ' +
                '<strong>' + kes(c.newPrice) + '</strong></li>'
            );
        });
        result.unavailable.forEach(function (u) {
            lines.push(
                '<li>• <strong>' + u.name + '</strong> is no longer available — please remove it from your cart</li>'
            );
        });

        const title = result.unavailable.length
            ? "Some items are no longer available"
            : "Prices have been updated";

        showWarning(
            '<p class="text-sm font-medium text-rose-dark mb-2">' + title + '</p>' +
            '<ul class="text-xs text-stone space-y-1 mb-3">' + lines.join("") + '</ul>' +
            '<p class="text-xs text-stone">Please review your cart and place the order again.</p>'
        );
    }

    // ==================== ERROR TRANSLATION ====================
    function translateError(err) {
        switch (err.code) {
            case "NOT_CONFIGURED":
                return "Orders are not available right now. Please call us at +254 710 191 260.";
            case "TIMEOUT":
                return "The request took too long. Please check your connection and try again.";
            case "NETWORK":
                return "We couldn't reach our server. Please check your connection and try again.";
            case "HTTP_500":
            case "HTTP_502":
            case "HTTP_503":
                return "Our server is temporarily unavailable. Please try again in a moment.";
            case "INSUFFICIENT_STOCK":
                return err.message || "One or more items are out of stock. Please review your cart.";
            case "INVALID_ITEM":
                return err.message || "One or more items in your cart are no longer available. Please review your cart.";
            case "INVALID_ZONE":
                return "Please select a valid delivery zone.";
            case "LOCK_TIMEOUT":
                return "We're receiving a lot of orders right now. Please wait a moment and try again.";
            case "INVALID_REQUEST":
                return "Some of your order details seem incomplete. Please check the form and try again.";
            case "MISSING_ACTION":
            case "UNKNOWN_ACTION":
            case "UNHANDLED":
                return "We hit an unexpected issue. Please try again, or call us if it persists.";
            default:
                return err.message || "Something went wrong placing your order. Please try again.";
        }
    }

    // ==================== SUCCESS SCREEN ====================
    function populateSuccessScreen(orderResult) {
        const displayName =
            (orderResult.customer && orderResult.customer.name) ||
            (orderResult.customerName) ||
            "friend";
        const firstName = displayName.trim().split(/\s+/)[0] || "friend";

        const nameEl = $("success-name");
        if (nameEl) nameEl.textContent = firstName;

        const numEl = $("success-order-number");
        if (numEl) numEl.textContent = orderResult.orderNumber || "—";

        const totalEl = $("success-total");
        if (totalEl) totalEl.textContent = kes(orderResult.total || 0);
    }

    // ==================== M-PESA FLOW ====================
    async function sendStkPush(orderResult) {
        try {
            const res = await window.PetalApi.post("initiateStkPush", {
                orderNumber: orderResult.orderNumber,
                phone:       orderResult.customer.phone,
                amount:      orderResult.total,
            });
            console.info("[Checkout] STK Push accepted:", res.checkoutRequestId);
            return { ok: true, message: res.customerMessage };
        } catch (err) {
            console.warn("[Checkout] STK Push failed:", err.code, err.message);
            return { ok: false, message: err.message, code: err.code };
        }
    }

    function showPayingState(orderResult) {
        const phoneEl  = $("paying-phone");
        const amountEl = $("paying-amount");
        const orderEl  = $("paying-order");
        if (phoneEl)  phoneEl.textContent  = maskPhone(orderResult.customer.phone);
        if (amountEl) amountEl.textContent = kes(orderResult.total);
        if (orderEl)  orderEl.textContent  = orderResult.orderNumber;
        showPaying();
    }

    function showPaymentFailedState(orderResult, message) {
        const orderEl   = $("failed-order");
        const totalEl   = $("failed-total");
        const messageEl = $("failed-message");
        if (orderEl)   orderEl.textContent   = orderResult.orderNumber;
        if (totalEl)   totalEl.textContent   = kes(orderResult.total);
        if (messageEl) messageEl.textContent = message || "The M-Pesa prompt wasn't confirmed.";

        // Reset retry button
        const btn = $("payment-retry-btn");
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Try Again";
            btn.classList.remove("cursor-wait");
        }

        showPaymentFailed();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function startPaymentFlow(orderResult) {
        currentOrder = orderResult;

        // Best-effort immediate STK push. If it fails, we still show the
        // paying screen — the customer can retry from the failed screen.
        showPayingState(orderResult);

        sendStkPush(orderResult).then(function (sendResult) {
            if (!sendResult.ok) {
                // Immediate rejection (e.g. bad phone, invalid amount).
                // Skip polling — this payment is not going anywhere.
                stopPolling();
                showPaymentFailedState(orderResult,
                    sendResult.message || "We couldn't send the M-Pesa prompt.");
                return;
            }
            beginPolling(orderResult);
        });
    }

    function beginPolling(orderResult) {
        stopPolling();
        poll.startedAt = Date.now();

        poll.intervalId = setInterval(function () {
            checkPaymentStatus(orderResult);
        }, POLL_INTERVAL_MS);

        poll.timeoutId = setTimeout(function () {
            stopPolling();
            if ($("checkout-paying") && !$("checkout-paying").classList.contains("hidden")) {
                showPaymentFailedState(orderResult,
                    "M-Pesa didn't respond in time. The payment may still come through — you can retry or track the order.");
            }
        }, PAYMENT_TIMEOUT_MS);
    }

    async function checkPaymentStatus(orderResult) {
        let payments;
        try {
            payments = await window.PetalApi.call("getPayments", {
                orderNumber: orderResult.orderNumber,
            });
        } catch (err) {
            // Network hiccup — the poller retries on the next tick.
            console.warn("[Checkout] Poll error:", err.message);
            return;
        }
        if (!Array.isArray(payments) || !payments.length) return;

        // getPayments returns newest first
        const latest = payments[0];
        const status = String(latest.status || "").toUpperCase();

        if (status === "PAID") {
            stopPolling();
            populateSuccessScreen(orderResult);
            showSuccess();
            window.scrollTo({ top: 0, behavior: "smooth" });

            try {
                localStorage.setItem("petal_craft_last_order", JSON.stringify({
                    orderNumber: orderResult.orderNumber,
                    total:       orderResult.total,
                    customer:    orderResult.customer,
                    createdAt:   new Date().toISOString(),
                }));
            } catch (e) { /* ignore */ }

            return;
        }

        if (status === "FAILED") {
            stopPolling();
            showPaymentFailedState(orderResult, latest.resultDesc || "The M-Pesa prompt was cancelled.");
        }
    }

    async function retryPayment() {
        if (!currentOrder) return;
        const btn = $("payment-retry-btn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Sending…";
            btn.classList.add("cursor-wait");
        }

        showPayingState(currentOrder);
        const sendResult = await sendStkPush(currentOrder);

        if (!sendResult.ok) {
            showPaymentFailedState(currentOrder,
                sendResult.message || "We couldn't send the M-Pesa prompt.");
            return;
        }
        beginPolling(currentOrder);
    }

    // ==================== PLACE ORDER ====================
    async function placeOrder() {
        if (submitting) return;

        const form = $("checkout-form");
        if (!form) return;

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        submitting = true;
        hideWarning();

        try {
            // ---- 1. Preflight ----
            setSubmitButton("checking");
            const preflight = await preflightPrices();

            if (!$("place-order-btn")) return;

            if (!preflight.ok) {
                renderPreflightWarning(preflight);
                return;
            }

            // ---- 2. Create order ----
            setSubmitButton("submitting");
            const payload = buildOrderPayload();
            const result = await window.PetalApi.post("createOrder", payload);

            if (!$("place-order-btn")) {
                // User navigated away; the order exists, drop the cart.
                window.PetalCart.clear();
                return;
            }

            // ---- 3. Clear the cart; order is confirmed ----
            try {
                localStorage.setItem("petal_craft_last_order", JSON.stringify({
                    orderNumber: result.orderNumber,
                    total:       result.total,
                    customer:    result.customer,
                    createdAt:   new Date().toISOString(),
                }));
            } catch (e) { /* ignore */ }
            window.PetalCart.clear();

            // ---- 4. Start M-Pesa flow ----
            startPaymentFlow(result);
        } catch (err) {
            console.error("[Checkout] Order failed:", err);
            if ($("place-order-btn")) {
                showSubmitError(translateError(err));
            }
        } finally {
            submitting = false;
            if ($("place-order-btn")) setSubmitButton("idle");
        }
    }

    function wireFormSubmit() {
        const form = $("checkout-form");
        if (!form) return;
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            placeOrder();
        });
    }

    // ==================== CART UPDATES ====================
    function onCartUpdated() {
        // Never interfere with post-submit states
        const formWrap = $("checkout-form-wrap");
        if (!formWrap || formWrap.classList.contains("hidden")) return;

        if (!getCart().length) {
            showEmpty();
            return;
        }
        renderSummaryItems();
        renderTotals();
    }

    // ==================== BOOTSTRAP ====================
    function initCheckout() {
        if (!$("checkout-form")) return;

        // Reset per-mount state
        zone = "cbd";
        submitting = false;
        currentOrder = null;
        stopPolling();

        const retryBtn = $("payment-retry-btn");
        if (retryBtn && !retryBtn._pcBound) {
            retryBtn._pcBound = true;
            retryBtn.addEventListener("click", retryPayment);
        }

        if (!getCart().length) {
            showEmpty();
        } else {
            showForm();
            hideWarning();
            setSubmitButton("idle");
            setMinDeliveryDate();
            renderAll();
            wireZoneChange();
            wireCharCount();
            wireFormSubmit();
        }

        if (!cartListenerBound) {
            document.addEventListener("petal:cart-updated", onCartUpdated);
            cartListenerBound = true;
        }
    }

    document.addEventListener("DOMContentLoaded", initCheckout);
    document.addEventListener("petal:view-loaded", initCheckout);
})();

// PCB-20261002-820484

