/**
 * Petal Craft Blooms — API client
 * Thin fetch wrapper for the Apps Script web app.
 *
 * GET  — reads. Simple request, no preflight.
 * POST — writes. Body is JSON, but we deliberately do NOT set
 *        Content-Type. The browser's default for a string body is
 *        `text/plain;charset=UTF-8`, which is CORS-safelisted. Setting
 *        any custom header (including application/json) would trigger
 *        a preflight that Apps Script cannot answer.
 *
 * Exposes: window.PetalApi
 */

(function () {
    "use strict";

    const DEFAULT_TIMEOUT_MS = 20000;

    // ==================== URL HELPERS ====================
    function getBaseUrl() {
        if (typeof window.PETAL_API_URL === "string" && window.PETAL_API_URL) {
            return window.PETAL_API_URL;
        }
        const meta = document.querySelector('meta[name="petal-api-url"]');
        if (meta && meta.content && meta.content.trim()) {
            return meta.content.trim();
        }
        return null;
    }

    function buildUrl(action, params) {
        const base = getBaseUrl();
        if (!base) return null;
        const url = new URL(base);
        url.searchParams.set("action", action);
        if (params) {
            Object.keys(params).forEach(function (k) {
                const v = params[k];
                if (v !== undefined && v !== null && v !== "") {
                    url.searchParams.set(k, String(v));
                }
            });
        }
        return url.toString();
    }

    // ==================== LOW-LEVEL PLUMBING ====================
    function makeController(timeout) {
        const controller = new AbortController();
        const id = setTimeout(function () { controller.abort(); }, timeout || DEFAULT_TIMEOUT_MS);
        return { controller: controller, clear: function () { clearTimeout(id); } };
    }

    function translateFetchError(fetchErr) {
        const err = new Error(
            fetchErr.name === "AbortError"
                ? "Request timed out"
                : "We couldn't reach the server"
        );
        err.code = fetchErr.name === "AbortError" ? "TIMEOUT" : "NETWORK";
        return err;
    }

    async function parseResponse(res) {
        if (!res.ok) {
            const err = new Error("Server error (HTTP " + res.status + ")");
            err.code = "HTTP_" + res.status;
            throw err;
        }
        let json;
        try {
            json = await res.json();
        } catch (parseErr) {
            const err = new Error("Invalid response from server");
            err.code = "INVALID_JSON";
            throw err;
        }
        if (!json || typeof json !== "object") {
            const err = new Error("Invalid response from server");
            err.code = "INVALID_JSON";
            throw err;
        }
        if (!json.success) {
            const err = new Error(json.error || "Request failed");
            err.code = json.code || "ERROR";
            throw err;
        }
        return json.data;
    }

    // ==================== GET ====================
    async function call(action, params, options) {
        options = options || {};
        const url = buildUrl(action, params);
        if (!url) {
            const err = new Error("API URL not configured");
            err.code = "NOT_CONFIGURED";
            throw err;
        }

        const ctl = makeController(options.timeout);
        let res;
        try {
            res = await fetch(url, { method: "GET", signal: ctl.controller.signal });
        } catch (fetchErr) {
            ctl.clear();
            throw translateFetchError(fetchErr);
        }
        ctl.clear();
        return parseResponse(res);
    }

    // ==================== POST ====================
    async function post(action, payload, options) {
        options = options || {};
        const base = getBaseUrl();
        if (!base) {
            const err = new Error("API URL not configured");
            err.code = "NOT_CONFIGURED";
            throw err;
        }

        const body = JSON.stringify(Object.assign({ action: action }, payload || {}));
        const ctl = makeController(options.timeout);

        let res;
        try {
            res = await fetch(base, {
                method: "POST",
                signal: ctl.controller.signal,
                body: body,
                // NOTE: no `headers` key. See file header for why.
            });
        } catch (fetchErr) {
            ctl.clear();
            throw translateFetchError(fetchErr);
        }
        ctl.clear();
        return parseResponse(res);
    }

    // ==================== PUBLIC ====================
    window.PetalApi = {
        call: call,
        post: post,
        isConfigured: function () { return !!getBaseUrl(); },
        getBaseUrl: getBaseUrl,
    };
})();