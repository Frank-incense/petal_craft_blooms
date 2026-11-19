/**
 * Petal Craft Blooms — Wholesale catalogue
 * Phase W1: variety data, SKU generator, USD pricing.
 * Exposes: window.PetalWholesaleCatalog
 */

(function () {
    "use strict";

    // ==================== PRICING CONFIG ====================
    // Base price in USD per stem, indexed by stem length (cm).
    // Category multipliers are applied on top of these.
    const BASE_PRICES_USD = {
        40:  0.15,
        50:  0.20,
        60:  0.26,
        70:  0.32,
        80:  0.41,
        90:  0.51,
        100: 0.64,
        110: 0.78,
        120: 0.98,
    };

    const CATEGORIES = {
        super_intermediates: { prefix: "SI", label: "Super Intermediates",      multiplier: 1.00, order: 1 },
        premium:             { prefix: "PR", label: "Premium",                  multiplier: 1.15, order: 2 },
        special_premium:     { prefix: "SP", label: "Special Premium",          multiplier: 1.30, order: 3 },
        scented_special:     { prefix: "SS", label: "Scented Special Premium",  multiplier: 1.55, order: 4 },
        spray:               { prefix: "SR", label: "Special Spray Roses",      multiplier: 0.70, order: 5 },
    };

    const LENGTHS = [40, 50, 60, 70, 80, 90, 100, 110, 120];

    const SKU_MIN_STEMS = 100;
    const ORDER_MIN_STEMS = 1000;

    const VOLUME_DISCOUNTS = [
        { minStems: 50000, discount: 0.15 },
        { minStems: 20000, discount: 0.10 },
        { minStems: 5000,  discount: 0.05  },
        { minStems: 0,     discount: 0.00  },
    ];

    // ==================== VARIETY DATA ====================
    // Flat list of every variety. Category is one of the five keys above.
    const VARIETIES = [
        // ---- Super Intermediates ----
        { category: "super_intermediates", name: "Athena Royale",  colour: "Pink" },
        { category: "super_intermediates", name: "Pink Athena",    colour: "Pink" },
        { category: "super_intermediates", name: "Revival",        colour: "Pink" },
        { category: "super_intermediates", name: "Madam Red",      colour: "Red" },
        { category: "super_intermediates", name: "Good Times",     colour: "Yellow" },
        { category: "super_intermediates", name: "Gold Finch",     colour: "Yellow" },
        { category: "super_intermediates", name: "Madam Cerise",   colour: "Cerise" },
        { category: "super_intermediates", name: "Confidential",   colour: "Orange" },
        { category: "super_intermediates", name: "Deep Purple",    colour: "Bi Colour (Purple/Lilac)" },
        { category: "super_intermediates", name: "Fire & Flame",   colour: "Bi Colour (Red/Yellow)" },
        { category: "super_intermediates", name: "Athena",         colour: "White" },

        // ---- Premium ----
        { category: "premium", name: "Ever Red",       colour: "Red" },
        { category: "premium", name: "Red Monarch",    colour: "Red" },
        { category: "premium", name: "Explorer",       colour: "Red" },
        { category: "premium", name: "Royal Class",    colour: "Red" },
        { category: "premium", name: "Novavita",       colour: "Pure White" },
        { category: "premium", name: "Proud",          colour: "Pure White" },
        { category: "premium", name: "Albatross",      colour: "White" },
        { category: "premium", name: "Mount Royal",    colour: "Pure White" },
        { category: "premium", name: "Pomarosa",       colour: "Pink Peach" },
        { category: "premium", name: "Roxanne",        colour: "Cream Peach" },
        { category: "premium", name: "Hot Spot",       colour: "Cerise" },
        { category: "premium", name: "Paloma Royale",  colour: "Cerise" },
        { category: "premium", name: "Pink Floyd",     colour: "Hot Spot" },
        { category: "premium", name: "Mandala",        colour: "Bi Colour (White/Pink)" },
        { category: "premium", name: "Fluence",        colour: "Bi Colour (White/Pink)" },
        { category: "premium", name: "Jumilia",        colour: "Bi Colour (White/Red)" },
        { category: "premium", name: "Paloma Vintage", colour: "Bi Colour" },
        { category: "premium", name: "Paloma",         colour: "Bi Colour" },
        { category: "premium", name: "Superstition",   colour: "Salmon" },
        { category: "premium", name: "Yelloween",      colour: "Yellow" },
        { category: "premium", name: "Light Yellow",   colour: "Bubble Bee" },
        { category: "premium", name: "Lilac",          colour: "Cool Down" },
        { category: "premium", name: "Moody Blues",    colour: "Cool Down" },
        { category: "premium", name: "Dark Orange",    colour: "Garfield" },
        { category: "premium", name: "Light Orange",   colour: "Maranja" },

        // ---- Special Premium ----
        { category: "special_premium", name: "Cold Play", colour: "White" },

        // ---- Scented Special Premium ----
        { category: "scented_special", name: "White Ohara", colour: "White" },
        { category: "scented_special", name: "Pink Ohara",  colour: "Pink" },

        // ---- Special Spray Roses ----
        { category: "spray", name: "Julieta",             colour: "Pink" },
        { category: "spray", name: "Julieta Cerise",      colour: "Cerise" },
        { category: "spray", name: "Julieta Honey",       colour: "Pink Champagne" },
        { category: "spray", name: "Silver Pink",         colour: "Pink" },
        { category: "spray", name: "Mansfield Park",      colour: "Bi Colour (Blush)" },
        { category: "spray", name: "Red Trend Setter",    colour: "Red" },
        { category: "spray", name: "Royal Magic",         colour: "Cerise" },
        { category: "spray", name: "Summer Rose",         colour: "Cream/Peach" },
        { category: "spray", name: "Apricot Lace",        colour: "Apricot" },
        { category: "spray", name: "Gentle Trend Setter", colour: "Bi Colour" },
    ];

    // ==================== HELPERS ====================
    function slugify(s) {
        return String(s).toLowerCase()
            .replace(/&/g, "and")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    }

    function formatUSD(amount) {
        return "$" + Number(amount).toFixed(2);
    }

    function priceForStem(categoryKey, lengthCm) {
        const base = BASE_PRICES_USD[lengthCm];
        const cat = CATEGORIES[categoryKey];
        if (base === undefined || !cat) return null;
        return base * cat.multiplier;
    }

    // ==================== SKU GENERATION ====================
    function buildSku(variety, lengthCm) {
        const cat = CATEGORIES[variety.category];
        const pricePerStem = priceForStem(variety.category, lengthCm);
        const lengthPadded = String(lengthCm).padStart(3, "0");
        const id = cat.prefix + "-" + slugify(variety.name).toUpperCase() + "-" + lengthPadded;

        return {
            id: id,
            category: variety.category,
            categoryLabel: cat.label,
            variety: variety.name,
            colour: variety.colour,
            lengthCm: lengthCm,
            pricePerStem: Math.round(pricePerStem * 100) / 100,
            skuMinStems: SKU_MIN_STEMS,
            active: true,
        };
    }

    function buildAllSkus() {
        const out = [];
        VARIETIES.forEach(function (v) {
            LENGTHS.forEach(function (len) {
                out.push(buildSku(v, len));
            });
        });
        return out;
    }

    // Build once at load — 441 SKUs, negligible memory.
    const SKUS = buildAllSkus();

    // ==================== QUERY HELPERS ====================
    const Catalog = {
        all: function () { return SKUS; },

        categories: function () {
            return Object.keys(CATEGORIES)
                .map(function (key) {
                    return { key: key, label: CATEGORIES[key].label, order: CATEGORIES[key].order };
                })
                .sort(function (a, b) { return a.order - b.order; });
        },

        colours: function () {
            const set = {};
            SKUS.forEach(function (s) { set[s.colour] = true; });
            return Object.keys(set).sort();
        },

        lengths: function () { return LENGTHS.slice(); },

        byId: function (id) {
            return SKUS.find(function (s) { return s.id === id; }) || null;
        },

        /**
         * Filter SKUs by an object with optional keys:
         *   { search, category, colour, lengthMin, lengthMax }
         */
        filter: function (opts) {
            opts = opts || {};
            let list = SKUS;

            if (opts.category && opts.category !== "all") {
                list = list.filter(function (s) { return s.category === opts.category; });
            }
            if (opts.colour && opts.colour !== "all") {
                list = list.filter(function (s) { return s.colour === opts.colour; });
            }
            if (typeof opts.lengthMin === "number") {
                list = list.filter(function (s) { return s.lengthCm >= opts.lengthMin; });
            }
            if (typeof opts.lengthMax === "number") {
                list = list.filter(function (s) { return s.lengthCm <= opts.lengthMax; });
            }
            if (opts.search && opts.search.trim()) {
                const q = opts.search.trim().toLowerCase();
                list = list.filter(function (s) {
                    return (
                        s.variety.toLowerCase().indexOf(q) !== -1 ||
                        s.colour.toLowerCase().indexOf(q) !== -1 ||
                        s.categoryLabel.toLowerCase().indexOf(q) !== -1 ||
                        s.id.toLowerCase().indexOf(q) !== -1
                    );
                });
            }
            return list;
        },
    };

    // ==================== PUBLIC API ====================
    window.PetalWholesaleCatalog = {
        Catalog: Catalog,
        formatUSD: formatUSD,
        SKU_MIN_STEMS: SKU_MIN_STEMS,
        ORDER_MIN_STEMS: ORDER_MIN_STEMS,
        VOLUME_DISCOUNTS: VOLUME_DISCOUNTS,
        _priceForStem: priceForStem, // for tests
    };
})();
