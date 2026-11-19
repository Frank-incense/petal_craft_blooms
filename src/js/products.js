/**
 * Petal Craft Blooms — Product catalogue
 * Phase 2: real catalogue (from screenshots), single-price model
 * Phase 3: cart logic delegated to js/cart.js
 * Phase 7: fetches products from the Apps Script API on boot.
 *          Falls back to a local dataset if the API is unavailable.
 *
 * Exposes: window.PetalProducts
 */

(function () {
    "use strict";

    // ==================== FALLBACK DATA ====================
    // Used only when the API URL isn't configured or the fetch fails.
    // The authoritative catalogue lives in the Products sheet.
    // const FALLBACK_PRODUCTS = [
    //     { id: "pcb001", name: "Crimson Rose Bouquet", slug: "crimson-rose-bouquet", description: "A classic bouquet of fresh red roses arranged elegantly.", category: "Roses", occasion: "Anniversary", price: 3500, image: "https://images.unsplash.com/photo-1548586196-aa5803b77379?w=800&q=80", rating: 4.8, featured: false, active: true },
    //     { id: "pcb002", name: "Midnight Rose Elegance", slug: "midnight-rose-elegance", description: "6 red roses with baby's breath, wrapped in dark kraft paper.", category: "Roses", occasion: "Anniversary", price: 3200, image: "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=800&q=80", rating: 4.9, featured: false, active: true },
    //     { id: "pcb003", name: "Garden Romance Bouquet", slug: "garden-romance-bouquet", description: "Gerberas, spray roses, mixed pink & mauve blooms.", category: "Mixed", occasion: "Birthday", price: 4500, image: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=800&q=80", rating: 4.8, featured: false, active: true },
    //     { id: "pcb004", name: "Grand Romance Rose Bouquet", slug: "grand-romance-rose-bouquet", description: "A luxurious arrangement of premium red roses.", category: "Roses", occasion: "Anniversary", price: 8500, image: "https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=800&q=80", rating: 5.0, featured: true, active: true },
    //     { id: "pcb005", name: "Classic Red Romance", slug: "classic-red-romance", description: "6 premium red roses with baby's breath.", category: "Roses", occasion: "Anniversary", price: 3500, image: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&q=80", rating: 4.8, featured: false, active: true },
    //     { id: "pcb006", name: "Pink Passion Rose Bouquet", slug: "pink-passion-rose-bouquet", description: "A graceful blend of pink and red roses.", category: "Roses", occasion: "Birthday", price: 4800, image: "https://images.unsplash.com/photo-1454944338482-a69bb95894af?w=800&q=80", rating: 4.9, featured: false, active: true },
    //     { id: "pcb007", name: "Radiant Mixed Blooms Bouquet", slug: "radiant-mixed-blooms-bouquet", description: "A colourful arrangement of red roses, white daisies, and mixed blooms.", category: "Mixed", occasion: "Congratulations", price: 4800, image: "https://images.unsplash.com/photo-1487070183336-b863922373d4?w=800&q=80", rating: 4.7, featured: false, active: true },
    //     { id: "pcb008", name: "\u201CI Love You\u201D Grand Bouquet", slug: "i-love-you-grand-bouquet", description: "Full round of 50 red roses with baby's breath.", category: "Roses", occasion: "Anniversary", price: 9500, image: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80", rating: 5.0, featured: true, active: true },
    //     { id: "pcb009", name: "Blush & Crimson Rose Bouquet", slug: "blush-crimson-rose-bouquet", description: "A stunning blend of soft pink and deep crimson roses.", category: "Roses", occasion: "Anniversary", price: 5500, image: "https://images.unsplash.com/photo-1562690868-60bbe7293e94?w=800&q=80", rating: 4.9, featured: false, active: true },
    //     { id: "pcb010", name: "Classic Red & White Bouquet", slug: "classic-red-white-bouquet", description: "A timeless mix of fresh red roses, white blooms, and greenery.", category: "Mixed", occasion: "Just Because", price: 3800, image: "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?w=800&q=80", rating: 4.8, featured: false, active: true },
    //     { id: "pcb011", name: "Lavender Dreams", slug: "lavender-dreams", description: "Pink gerberas, lavender roses, carnations, and mixed blooms.", category: "Mixed", occasion: "Just Because", price: 4800, image: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=800&q=80", rating: 4.9, featured: true, active: true },
    //     { id: "pcb012", name: "Premium Mixed Rose Bouquet", slug: "premium-mixed-rose-bouquet", description: "A luxurious combination of red, pink, and white roses.", category: "Roses", occasion: "Anniversary", price: 6000, image: "https://images.unsplash.com/photo-1548586196-aa5803b77379?w=800&q=80", rating: 4.9, featured: true, active: true },
    //     { id: "pcb013", name: "Sweet Rose Bouquet", slug: "sweet-rose-bouquet", description: "A charming bouquet of fresh red roses.", category: "Roses", occasion: "Just Because", price: 3000, image: "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?w=800&q=80", rating: 4.7, featured: false, active: true },
    //     { id: "pcb014", name: "Garden Elegance Bouquet", slug: "garden-elegance-bouquet", description: "A vibrant hand-tied bouquet featuring mixed seasonal blooms.", category: "Mixed", occasion: "Just Because", price: 4500, image: "https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=800&q=80", rating: 4.8, featured: false, active: true },
    //     { id: "pcb015", name: "Sunset Bloom Mix", slug: "sunset-bloom-mix", description: "Red roses, orange & purple chrysanthemums in a warm mix.", category: "Mixed", occasion: "Congratulations", price: 3800, image: "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=800&q=80", rating: 4.7, featured: false, active: true },
    //     { id: "pcb016", name: "Blush & Cream Delight", slug: "blush-cream-delight", description: "White, blush and hot pink roses with baby's breath.", category: "Roses", occasion: "Birthday", price: 5200, image: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=800&q=80", rating: 4.9, featured: false, active: true },
    //     { id: "pcb017", name: "Ruby Rose Bouquet", slug: "ruby-rose-bouquet", description: "Rich red roses paired with baby's breath.", category: "Roses", occasion: "Anniversary", price: 4200, image: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&q=80", rating: 4.8, featured: false, active: true },
    // ];

    // ==================== MODULE STATE ====================
    let cache = [];            // current products in memory
    let isLoading = false;
    let lastError = null;
    let loadedFrom = null;     // "api" | "fallback" | null

    // ==================== UTILITIES ====================
    function formatKES(amount) {
        return "KES " + Number(amount).toLocaleString("en-KE");
    }

    function renderRating(rating) {
        return "★ " + Number(rating).toFixed(1);
    }

    // ==================== STORE ====================
    const ProductStore = {
        all() {
            return cache.filter(function (p) { return p.active; });
        },
        featured() {
            return this.all().filter(function (p) { return p.featured; });
        },
        byId(id) {
            return cache.find(function (p) { return p.id === id; });
        },
        categories() {
            var set = {};
            this.all().forEach(function (p) { set[p.category] = true; });
            return Object.keys(set).sort();
        },
        occasions() {
            var set = {};
            this.all().forEach(function (p) { set[p.occasion] = true; });
            return Object.keys(set).sort();
        },
        indexOf(id) {
            return cache.findIndex(function (p) { return p.id === id; });
        },
        isLoading() { return isLoading; },
        getError() { return lastError; },
        getSource() { return loadedFrom; },
    };

    // ==================== LOADING ====================
    function useFallbackProducts(reason) {
        cache = FALLBACK_PRODUCTS.slice();
        loadedFrom = "fallback";
        if (reason) console.warn("[PetalProducts] Using fallback catalogue:", reason);
        document.dispatchEvent(new CustomEvent("petal:products-loaded", {
            detail: { source: "fallback", count: cache.length }
        }));
    }

    async function loadProducts() {
        if (isLoading) return;
        isLoading = true;
        lastError = null;
        document.dispatchEvent(new CustomEvent("petal:products-loading"));

        try {
            const products = await window.PetalApi.call("getProducts");
            if (!Array.isArray(products)) throw new Error("Unexpected response shape");
            cache = products;
            loadedFrom = "api";
            console.info("[PetalProducts] Loaded " + products.length + " products from API");
        } catch (err) {
            lastError = err;
            console.warn("[PetalProducts] API fetch failed:", err.message);
            if (!cache.length) {
                cache = FALLBACK_PRODUCTS.slice();
                loadedFrom = "fallback";
            }
        } finally {
            isLoading = false;
            document.dispatchEvent(new CustomEvent("petal:products-loaded", {
                detail: { source: loadedFrom, count: cache.length, error: lastError }
            }));
        }
    }

    // ==================== SKELETON / EMPTY ====================
    function skeletonCardHTML() {
        return (
            '<div class="bg-white rounded-xl overflow-hidden border border-beige/50 animate-pulse">' +
                '<div class="aspect-[4/5] bg-beige/40"></div>' +
                '<div class="p-4 space-y-2">' +
                    '<div class="h-2 w-12 bg-beige/60 rounded"></div>' +
                    '<div class="h-4 w-3/4 bg-beige/60 rounded"></div>' +
                    '<div class="h-3 w-full bg-beige/40 rounded"></div>' +
                    '<div class="h-4 w-1/2 bg-beige/60 rounded mt-3"></div>' +
                '</div>' +
            '</div>'
        );
    }

    function renderSkeletons(container, count) {
        container.innerHTML = new Array(count || 4).fill(skeletonCardHTML()).join("");
    }

    // ==================== CARD RENDERING ====================
    function productCardHTML(product) {
        var badge = "";
        if (product.featured) {
            badge = '<span class="absolute top-3 left-3 bg-ivory/90 text-forest text-xs font-medium px-3 py-1 rounded-full">Featured</span>';
        }

        return (
            '<article class="product-card group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-beige/50 cursor-pointer" data-product-id="' + product.id + '">' +
                '<div class="relative overflow-hidden aspect-[4/5]">' +
                    '<img src="' + product.image + '" alt="' + product.name + '" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />' +
                    badge +
                    '<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-charcoal/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-3">' +
                        '<span class="text-ivory text-xs font-medium tracking-wider uppercase">View Details</span>' +
                    '</div>' +
                '</div>' +
                '<div class="p-4">' +
                    '<p class="text-[10px] uppercase tracking-wider text-sage font-medium mb-1">' + product.category + '</p>' +
                    '<h3 class="font-display text-lg font-medium text-forest leading-tight">' + product.name + '</h3>' +
                    '<p class="text-stone text-xs mt-1.5 leading-relaxed">' + product.description + '</p>' +
                    '<div class="flex items-center justify-between mt-3 pt-3 border-t border-beige/60">' +
                        '<span class="text-forest font-semibold text-sm">' + formatKES(product.price) + '</span>' +
                        '<span class="text-rose text-xs">' + renderRating(product.rating) + '</span>' +
                    '</div>' +
                '</div>' +
            '</article>'
        );
    }

    function renderGrid(container, products, options) {
        if (!container) return;
        options = options || {};

        // Loading skeleton when cache is empty and fetch is in flight
        if (isLoading && !products.length && !options.noSkeleton) {
            renderSkeletons(container, options.skeletonCount || 4);
            return;
        }

        if (!products.length) {
            container.innerHTML =
                '<div class="col-span-full text-center py-16">' +
                    '<p class="font-display text-xl text-forest mb-2">No flowers match your search</p>' +
                    '<p class="text-stone text-sm">Try adjusting your filters or search term.</p>' +
                '</div>';
            return;
        }
        container.innerHTML = products.map(productCardHTML).join("");
    }

    // ==================== PRODUCT MODAL ====================
    var modalState = { productId: null, qty: 1 };

    function ensureModalExists() {
        if (document.getElementById("product-modal")) return;

        var html =
            '<div id="product-modal" class="fixed inset-0 z-[100] hidden" role="dialog" aria-modal="true">' +
                '<div id="modal-backdrop" class="absolute inset-0 bg-charcoal/60 backdrop-blur-sm"></div>' +
                '<div class="relative h-full w-full flex items-start sm:items-center justify-center p-4 overflow-y-auto">' +
                    '<div class="bg-ivory rounded-2xl max-w-4xl w-full shadow-2xl relative my-8 overflow-hidden">' +
                        '<button id="modal-close" aria-label="Close" class="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-ivory/95 hover:bg-ivory text-forest flex items-center justify-center shadow-sm transition-colors">' +
                            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
                        '</button>' +
                        '<div class="grid grid-cols-1 md:grid-cols-2">' +
                            '<div class="aspect-square md:aspect-auto md:min-h-[560px] overflow-hidden bg-cream">' +
                                '<img id="modal-image" src="" alt="" class="w-full h-full object-cover" />' +
                            '</div>' +
                            '<div class="p-6 sm:p-8 flex flex-col">' +
                                '<p id="modal-category" class="text-[10px] uppercase tracking-[0.2em] text-sage font-medium mb-2"></p>' +
                                '<h2 id="modal-name" class="font-display text-2xl sm:text-3xl font-medium text-forest mb-1"></h2>' +
                                '<div id="modal-rating" class="text-rose text-sm mb-5"></div>' +
                                '<p id="modal-description" class="text-stone text-sm font-light leading-relaxed mb-6"></p>' +
                                '<div class="mb-6">' +
                                    '<p class="text-[11px] font-medium text-forest uppercase tracking-wider mb-3">Quantity</p>' +
                                    '<div class="inline-flex items-center border border-beige rounded-md overflow-hidden">' +
                                        '<button id="qty-minus" aria-label="Decrease" class="w-10 h-10 text-forest hover:bg-cream text-lg leading-none">−</button>' +
                                        '<span id="qty-value" class="w-14 h-10 flex items-center justify-center font-medium text-forest border-x border-beige">1</span>' +
                                        '<button id="qty-plus" aria-label="Increase" class="w-10 h-10 text-forest hover:bg-cream text-lg leading-none">+</button>' +
                                    '</div>' +
                                '</div>' +
                                '<div class="mt-auto pt-5 border-t border-beige flex items-center justify-between gap-4">' +
                                    '<div>' +
                                        '<p class="text-[11px] uppercase tracking-wider text-stone mb-0.5">Total</p>' +
                                        '<p id="modal-total" class="text-forest font-semibold text-xl"></p>' +
                                    '</div>' +
                                    '<button id="modal-add-btn" class="px-6 py-3 bg-forest text-ivory font-medium text-sm rounded-md hover:bg-forest-light transition-colors">' +
                                        'Add to Cart' +
                                    '</button>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML("beforeend", html);

        document.getElementById("modal-close").addEventListener("click", closeProductModal);
        document.getElementById("modal-backdrop").addEventListener("click", closeProductModal);
        document.getElementById("qty-minus").addEventListener("click", function () {
            if (modalState.qty > 1) { modalState.qty--; renderModal(); }
        });
        document.getElementById("qty-plus").addEventListener("click", function () {
            if (modalState.qty < 20) { modalState.qty++; renderModal(); }
        });
        document.getElementById("modal-add-btn").addEventListener("click", function () {
            var product = ProductStore.byId(modalState.productId);
            if (product) window.PetalCart.addItem(product, modalState.qty);
            closeProductModal();
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closeProductModal();
        });
    }

    function openProductModal(id) {
        var product = ProductStore.byId(id);
        if (!product) return;

        modalState = { productId: id, qty: 1 };
        renderModal();
        document.getElementById("product-modal").classList.remove("hidden");
        document.body.style.overflow = "hidden";
    }

    function closeProductModal() {
        var modal = document.getElementById("product-modal");
        if (!modal) return;
        modal.classList.add("hidden");
        document.body.style.overflow = "";
    }

    function renderModal() {
        var p = ProductStore.byId(modalState.productId);
        if (!p) return;

        document.getElementById("modal-image").src = p.image;
        document.getElementById("modal-image").alt = p.name;
        document.getElementById("modal-category").textContent = p.category + " · " + p.occasion;
        document.getElementById("modal-name").textContent = p.name;
        document.getElementById("modal-rating").textContent = renderRating(p.rating) + " (" + Math.round(p.rating * 37) + " reviews)";
        document.getElementById("modal-description").textContent = p.description;
        document.getElementById("qty-value").textContent = modalState.qty;
        document.getElementById("modal-total").textContent = formatKES(p.price * modalState.qty);
    }

    // ==================== EVENT DELEGATION FOR CARD CLICKS ====================
    function bindGridClicks(container) {
        if (!container || container._pcBound) return;
        container._pcBound = true;
        container.addEventListener("click", function (e) {
            var card = e.target.closest("[data-product-id]");
            if (!card) return;
            openProductModal(card.getAttribute("data-product-id"));
        });
    }

    // ==================== PAGE: INDEX (FEATURED) ====================
    function initFeaturedPage() {
        var grid = document.getElementById("featured-grid");
        if (!grid) return;
        renderGrid(grid, ProductStore.featured(), { skeletonCount: 4 });
        bindGridClicks(grid);
    }

    // ==================== PAGE: SHOP ====================
    var shopState = {
        search: "",
        category: "all",
        occasion: "all",
        sort: "featured",
    };

    function getFilteredProducts() {
        var list = ProductStore.all();
        var s = shopState.search.trim().toLowerCase();

        if (s) {
            list = list.filter(function (p) {
                return (
                    p.name.toLowerCase().indexOf(s) !== -1 ||
                    p.description.toLowerCase().indexOf(s) !== -1 ||
                    p.category.toLowerCase().indexOf(s) !== -1 ||
                    p.occasion.toLowerCase().indexOf(s) !== -1
                );
            });
        }
        if (shopState.category !== "all") {
            list = list.filter(function (p) { return p.category === shopState.category; });
        }
        if (shopState.occasion !== "all") {
            list = list.filter(function (p) { return p.occasion === shopState.occasion; });
        }

        var sorted = list.slice();
        switch (shopState.sort) {
            case "price-asc":
                sorted.sort(function (a, b) { return a.price - b.price; });
                break;
            case "price-desc":
                sorted.sort(function (a, b) { return b.price - a.price; });
                break;
            case "rating":
                sorted.sort(function (a, b) { return b.rating - a.rating; });
                break;
            case "name":
                sorted.sort(function (a, b) { return a.name.localeCompare(b.name); });
                break;
            case "featured":
            default:
                sorted.sort(function (a, b) {
                    var af = a.featured ? 0 : 1;
                    var bf = b.featured ? 0 : 1;
                    if (af !== bf) return af - bf;
                    return ProductStore.indexOf(a.id) - ProductStore.indexOf(b.id);
                });
                break;
        }
        return sorted;
    }

    function populateShopFilters() {
        var categorySel = document.getElementById("filter-category");
        var occasionSel = document.getElementById("filter-occasion");

        // Rebuild options each time — the cache may have changed since
        // the last mount (e.g. API fetch completed after first render).
        if (categorySel) {
            var currentCat = categorySel.value;
            while (categorySel.options.length > 1) categorySel.remove(1);
            ProductStore.categories().forEach(function (c) {
                var opt = document.createElement("option");
                opt.value = c;
                opt.textContent = c;
                categorySel.appendChild(opt);
            });
            categorySel.value = currentCat && categorySel.querySelector('option[value="' + currentCat + '"]') ? currentCat : "all";
        }
        if (occasionSel) {
            var currentOcc = occasionSel.value;
            while (occasionSel.options.length > 1) occasionSel.remove(1);
            ProductStore.occasions().forEach(function (o) {
                var opt = document.createElement("option");
                opt.value = o;
                opt.textContent = o;
                occasionSel.appendChild(opt);
            });
            occasionSel.value = currentOcc && occasionSel.querySelector('option[value="' + currentOcc + '"]') ? currentOcc : "all";
        }
    }

    function renderShop() {
        var grid = document.getElementById("shop-grid");
        if (!grid) return;
        var products = getFilteredProducts();
        renderGrid(grid, products, { skeletonCount: 8 });

        var countEl = document.getElementById("shop-count");
        if (countEl) {
            if (isLoading && !ProductStore.all().length) {
                countEl.textContent = "Loading…";
            } else {
                var total = ProductStore.all().length;
                countEl.textContent = products.length + " of " + total + " arrangements";
            }
        }
    }

    function initShopPage() {
        var grid = document.getElementById("shop-grid");
        if (!grid) return;

        shopState.search = "";
        shopState.category = "all";
        shopState.occasion = "all";
        shopState.sort = "featured";

        populateShopFilters();
        bindGridClicks(grid);

        var searchInput = document.getElementById("filter-search");
        var categorySel = document.getElementById("filter-category");
        var occasionSel = document.getElementById("filter-occasion");
        var sortSel = document.getElementById("filter-sort");
        var clearBtn = document.getElementById("filter-clear");

        var debounceId;
        if (searchInput) {
            searchInput.addEventListener("input", function () {
                clearTimeout(debounceId);
                debounceId = setTimeout(function () {
                    shopState.search = searchInput.value;
                    renderShop();
                }, 180);
            });
        }
        if (categorySel) {
            categorySel.addEventListener("change", function () {
                shopState.category = categorySel.value;
                renderShop();
            });
        }
        if (occasionSel) {
            occasionSel.addEventListener("change", function () {
                shopState.occasion = occasionSel.value;
                renderShop();
            });
        }
        if (sortSel) {
            sortSel.addEventListener("change", function () {
                shopState.sort = sortSel.value;
                renderShop();
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                shopState.search = "";
                shopState.category = "all";
                shopState.occasion = "all";
                shopState.sort = "featured";
                if (searchInput) searchInput.value = "";
                if (categorySel) categorySel.value = "all";
                if (occasionSel) occasionSel.value = "all";
                if (sortSel) sortSel.value = "featured";
                renderShop();
            });
        }

        renderShop();
    }

    // ==================== BOOTSTRAP ====================
    function bootProductPages() {
        ensureModalExists();
        initFeaturedPage();
        initShopPage();
    }

    document.addEventListener("DOMContentLoaded", bootProductPages);
    document.addEventListener("petal:view-loaded", bootProductPages);
    document.addEventListener("petal:products-loaded", bootProductPages);

    // SPA: close the product modal on route change.
    document.addEventListener("petal:view-loaded", function () {
        closeProductModal();
    });

    // Kick off the fetch on boot — decide between API and fallback.
    function startProductLoad() {
        if (window.PetalApi && window.PetalApi.isConfigured()) {
            loadProducts();
        } else {
            useFallbackProducts("API URL not configured");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startProductLoad);
    } else {
        startProductLoad();
    }

    // ==================== PUBLIC API ====================
    window.PetalProducts = {
        Store: ProductStore,
        formatKES: formatKES,
        openProductModal: openProductModal,
        closeProductModal: closeProductModal,
        reload: loadProducts,
    };
})();