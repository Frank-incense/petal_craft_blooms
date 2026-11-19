/**
 * Petal Craft Blooms — Order tracking view (SPA)
 * Phase 10: look up an order by number + phone, render status timeline,
 * delivery details, and itemised summary.
 *The pill bounces, the shop grid shows shimmering skeleton on first load, the cart drawer slides in from the right but the product card hover, Occassion circle hover, Buttons transitions color smoothly and toast fades in and out are not working.  
 * Uses existing backend actions:
 *   getOrder    → verifies phone match, returns order + items
 *   getDelivery → returns courier + delivery status (optional)
 */

(function () {
    "use strict";

    // ==================== TIMELINE DEFINITION ====================
    // Order statuses are cumulative from the backend's point of view:
    // PAID implies RECEIVED, PREPARING implies PAID, etc.
    // CANCELLED is a terminal branch that replaces the timeline entirely.
    const STEPS = [
        { key: "received",   label: "Order Received",      desc: "We've received your order." },
        { key: "paid",       label: "Payment Confirmed",   desc: "Your payment has been confirmed." },
        { key: "preparing",  label: "Preparing",           desc: "Our florists are handcrafting your bouquet." },
        { key: "ready",      label: "Ready for Delivery",  desc: "Your flowers are ready to be delivered." },
        { key: "out",        label: "Out for Delivery",    desc: "Your flowers are on the way." },
        { key: "delivered",  label: "Delivered",           desc: "Enjoy your flowers!" },
    ];

    const ORDER_STATUS_RANK = {
        RECEIVED:         0,
        PAID:             1,
        PREPARING:        2,
        READY:            3,
        OUT_FOR_DELIVERY: 4,
        DELIVERED:        5,
        CANCELLED:       -1,
    };

    const STATUS_BADGES = {
        RECEIVED:         { label: "Received",         classes: "bg-blue-50 text-blue-700 border border-blue-200" },
        PAID:             { label: "Paid",             classes: "bg-sage/20 text-forest border border-sage/40" },
        PREPARING:        { label: "Preparing",        classes: "bg-amber-50 text-amber-700 border border-amber-200" },
        READY:            { label: "Ready",            classes: "bg-amber-50 text-amber-700 border border-amber-200" },
        OUT_FOR_DELIVERY: { label: "Out for delivery", classes: "bg-amber-50 text-amber-700 border border-amber-200" },
        DELIVERED:        { label: "Delivered",        classes: "bg-sage/20 text-forest border border-sage/40" },
        CANCELLED:        { label: "Cancelled",        classes: "bg-rose/10 text-rose-dark border border-rose/40" },
    };

    // ==================== STATE ====================
    let busy = false;

    // ==================== UTILITIES ====================
    function $(id) { return document.getElementById(id); }
    function kes(n) { return window.PetalCart.formatKES(n); }

    function formatDate(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "—";
        return d.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
    }

    function formatDateTime(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "—";
        return d.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" }) +
               " · " +
               d.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
    }

    function escapeHtml(s) {
        if (s === null || s === undefined) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ==================== SCREEN MANAGEMENT ====================
    function showForm() {
        $("track-form-wrap").classList.remove("hidden");
        $("track-loading").classList.add("hidden");
        $("track-results").classList.add("hidden");
    }

    function showLoading() {
        $("track-form-wrap").classList.add("hidden");
        $("track-loading").classList.remove("hidden");
        $("track-results").classList.add("hidden");
    }

    function showResults() {
        $("track-form-wrap").classList.add("hidden");
        $("track-loading").classList.add("hidden");
        $("track-results").classList.remove("hidden");
    }

    function showError(message) {
        const el = $("track-error");
        if (!el) return;
        el.textContent = message;
        el.classList.remove("hidden");
    }

    function clearError() {
        const el = $("track-error");
        if (!el) return;
        el.classList.add("hidden");
        el.textContent = "";
    }

    // ==================== TIMELINE RENDERING ====================
    /**
     * Works out, for each step, whether it's completed and whether it's the
     * current step. Returns an array parallel to STEPS: [{completed, current}, …].
     */
    function computeStepStates(order, delivery) {
        const status = String(order.status || "").toUpperCase();
        const paymentStatus = String(order.paymentStatus || "").toUpperCase();

        // Payment step logic: consider PAID if paymentStatus says so
        // OR if order status rank is at least PAID.
        const orderRank = ORDER_STATUS_RANK[status] !== undefined ? ORDER_STATUS_RANK[status] : 0;
        const paid = paymentStatus === "PAID" || orderRank >= 1;

        // Delivery statuses from the Deliveries sheet can advance the
        // "out for delivery" and "delivered" steps even if the parent
        // order's status hasn't caught up.
        const deliveryStatus = delivery ? String(delivery.status || "").toUpperCase() : "";
        const delivered = orderRank >= 5 || deliveryStatus === "DELIVERED";
        const outForDelivery = orderRank >= 4 ||
            deliveryStatus === "PICKED_UP" ||
            deliveryStatus === "IN_TRANSIT";

        const completed = [
            true,                                                    // received
            paid,                                                    // paid
            orderRank >= 2,                                          // preparing
            orderRank >= 3,                                          // ready
            outForDelivery,                                          // out for delivery
            delivered,                                               // delivered
        ];

        // The "current" step is the last completed one, unless everything
        // is complete (then Delivered is current).
        let currentIdx = 0;
        for (let i = 0; i < completed.length; i++) {
            if (completed[i]) currentIdx = i;
        }

        // Payment failure is a special visual on the Paid step
        const paymentFailed = paymentStatus === "FAILED";

        return completed.map(function (done, i) {
            return {
                completed: done,
                current: i === currentIdx,
                failed: i === 1 && paymentFailed,
            };
        });
    }

    function timelineHTML(order, delivery) {
        const states = computeStepStates(order, delivery);

        // Timestamps we may have for particular steps
        const timestamps = {
            0: order.createdAt ? formatDateTime(order.createdAt) : "",
            4: delivery && delivery.pickedUpAt ? formatDateTime(delivery.pickedUpAt) : "",
            5: delivery && delivery.deliveredAt ? formatDateTime(delivery.deliveredAt) : "",
        };

        return STEPS.map(function (step, i) {
            const s = states[i];

            let circleClass, circleContent, labelClass;
            if (s.failed) {
                circleClass = "bg-rose text-ivory";
                circleContent = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
                labelClass = "text-rose-dark font-medium";
            } else if (s.completed) {
                circleClass = s.current ? "bg-forest text-ivory ring-4 ring-sage/30" : "bg-sage text-ivory";
                circleContent = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                labelClass = s.current ? "text-forest font-semibold" : "text-forest font-medium";
            } else {
                circleClass = "bg-ivory border-2 border-beige text-stone";
                circleContent = '<span class="text-[10px]">' + (i + 1) + '</span>';
                labelClass = "text-stone";
            }

            const timestamp = timestamps[i];
            const descHtml = s.completed || s.current
                ? '<p class="text-xs text-stone mt-1 leading-snug">' + escapeHtml(step.desc) + '</p>'
                : '<p class="text-xs text-stone/70 mt-1 leading-snug">' + escapeHtml(step.desc) + '</p>';

            return (
                '<li class="mb-6 last:mb-0 ml-6 relative">' +
                    '<span class="absolute -left-[31px] flex items-center justify-center w-5 h-5 rounded-full ' + circleClass + '">' +
                        circleContent +
                    '</span>' +
                    '<h3 class="text-sm ' + labelClass + ' leading-tight">' + escapeHtml(step.label) + '</h3>' +
                    (timestamp ? '<p class="text-[11px] text-stone mt-0.5">' + escapeHtml(timestamp) + '</p>' : '') +
                    descHtml +
                '</li>'
            );
        }).join("");
    }

    // ==================== DETAILS RENDERING ====================
    function itemsHTML(items) {
        if (!items || !items.length) {
            return '<p class="text-sm text-stone italic py-3">No items found.</p>';
        }
        return items.map(function (item) {
            return (
                '<div class="py-3 first:pt-0 last:pb-0 flex justify-between gap-4">' +
                    '<div class="min-w-0">' +
                        '<p class="text-sm font-medium text-forest leading-tight">' + escapeHtml(item.name) + '</p>' +
                        (item.subtitle
                            ? '<p class="text-[11px] text-stone leading-snug mt-0.5">' + escapeHtml(item.subtitle) + '</p>'
                            : '') +
                        '<p class="text-[11px] text-stone mt-0.5">' + escapeHtml(item.quantity) + ' × ' + kes(item.unitPrice) + '</p>' +
                    '</div>' +
                    '<p class="text-sm font-semibold text-forest flex-shrink-0">' + kes(item.lineTotal) + '</p>' +
                '</div>'
            );
        }).join("");
    }

    function renderResult(order, delivery) {
        const status = String(order.status || "RECEIVED").toUpperCase();
        const isCancelled = status === "CANCELLED";

        // ---- Header ----
        $("result-order-number").textContent = order.orderNumber || "—";
        $("result-created-at").textContent = formatDate(order.createdAt);
        $("result-total").textContent = kes(order.total || 0);
        $("result-payment").textContent = order.paymentStatus || "—";

        // Status badge
        const badge = STATUS_BADGES[status] || STATUS_BADGES.RECEIVED;
        const badgeEl = $("result-status-badge");
        badgeEl.className = "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium " + badge.classes;
        badgeEl.textContent = badge.label;

        // ---- Cancelled notice ----
        $("result-cancelled").classList.toggle("hidden", !isCancelled);
        $("result-timeline-wrap").classList.toggle("hidden", isCancelled);

        // ---- Timeline (skip when cancelled) ----
        if (!isCancelled) {
            $("result-timeline").innerHTML = timelineHTML(order, delivery);
        }

        // ---- Delivery details ----
        $("result-address").textContent = order.address || "—";
        $("result-schedule").textContent =
            (order.deliveryDate ? formatDate(order.deliveryDate) : "—") +
            (order.deliveryTime ? " · " + order.deliveryTime : "");

        if (delivery && delivery.courierName) {
            $("result-courier-row").classList.remove("hidden");
            $("result-courier").textContent =
                delivery.courierName +
                (delivery.courierPhone ? " · " + delivery.courierPhone : "");
        } else {
            $("result-courier-row").classList.add("hidden");
        }

        // ---- Items ----
        $("result-items").innerHTML = itemsHTML(order.items);
        $("result-subtotal").textContent = kes(order.subtotal || 0);
        $("result-delivery").textContent = order.deliveryFee > 0 ? kes(order.deliveryFee) : "FREE";
        $("result-grand-total").textContent = kes(order.total || 0);
    }

    // ==================== LOOKUP ====================
    function translateError(err) {
        switch (err.code) {
            case "NOT_CONFIGURED":
                return "Order tracking is not available right now. Please call us at +254 700 000 000.";
            case "TIMEOUT":
                return "The lookup took too long. Please check your connection and try again.";
            case "NETWORK":
                return "We couldn't reach our server. Please check your connection and try again.";
            case "NOT_FOUND":
                return "We couldn't find an order with those details. Please double-check the order number and phone number.";
            case "MISSING_ID":
                return "Please enter both your order number and phone number.";
            default:
                return "Something went wrong looking up your order. Please try again.";
        }
    }

    async function lookupOrder(orderNumber, phone) {
        // 1. Verify the order + phone combination
        const order = await window.PetalApi.call("getOrder", {
            orderNumber: orderNumber,
            phone: phone,
        });

        // 2. Try to fetch delivery details — optional, may not exist
        let delivery = null;
        try {
            delivery = await window.PetalApi.call("getDelivery", {
                orderNumber: orderNumber,
            });
        } catch (err) {
            // Delivery not found is fine — no courier has been assigned yet
            if (err.code !== "NOT_FOUND") {
                console.warn("[Tracking] Delivery lookup failed:", err.message);
            }
        }

        return { order: order, delivery: delivery };
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (busy) return;

        const form = $("track-form");
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const orderNumber = $("track-order-number").value.trim();
        const phone = $("track-phone").value.trim();
        if (!orderNumber || !phone) {
            showError("Please enter both your order number and phone number.");
            return;
        }

        busy = true;
        clearError();
        showLoading();
        $("track-submit").disabled = true;
        $("track-submit").textContent = "Looking up…";

        try {
            const result = await lookupOrder(orderNumber, phone);

            // Guard: view was unmounted mid-flight
            if (!$("track-results")) {
                return;
            }

            renderResult(result.order, result.delivery);
            showResults();
            window.scrollTo({ top: 0, behavior: "smooth" });

        } catch (err) {
            console.error("[Tracking] Lookup failed:", err);
            showForm();
            showError(translateError(err));
        } finally {
            busy = false;
            const btn = $("track-submit");
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Find My Order";
            }
        }
    }

    function handleTrackAgain() {
        const form = $("track-form");
        if (!form) return;
        form.reset();
        clearError();
        showForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // ==================== BOOTSTRAP ====================
    function initTracking() {
        const form = $("track-form");
        if (!form) return;

        form.addEventListener("submit", handleSubmit);

        const againBtn = $("track-again-btn");
        if (againBtn) againBtn.addEventListener("click", handleTrackAgain);

        // Sensible default: if the user just placed an order, seed the
        // order number (not the phone — that's private and could be left
        // behind on a shared device).
        try {
            const last = JSON.parse(localStorage.getItem("petal_craft_last_order") || "null");
            if (last && last.orderNumber) {
                const numEl = $("track-order-number");
                if (numEl && !numEl.value) numEl.value = last.orderNumber;
            }
        } catch (e) { /* ignore */ }
    }

    document.addEventListener("DOMContentLoaded", initTracking);
    document.addEventListener("petal:view-loaded", initTracking);
})();