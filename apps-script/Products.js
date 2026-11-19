/**
 * Petal Craft Blooms — Products module
 * Phase 6A: read-only access to the Products sheet.
 * Write operations (admin add/edit) arrive in Phase 16.
 */

const Products = {
  getProducts: function () {
    const rows = Utils.readAllRows(CONFIG.SHEETS.PRODUCTS);
    const products = rows
      .map(Products._rowToProduct)
      .filter(function (p) { return p.active; });
    return Utils.success(products, 'Products retrieved');
  },

  getProduct: function (id) {
    if (!id) return Utils.error('Missing product id', 'MISSING_ID');
    const rows = Utils.readAllRows(CONFIG.SHEETS.PRODUCTS);
    const match = rows
      .map(Products._rowToProduct)
      .find(function (p) { return p.id === String(id); });
    if (!match) return Utils.error('Product not found', 'NOT_FOUND');
    return Utils.success(match, 'Product retrieved');
  },

  /**
   * Internal — returns every active + inactive product without the JSON
   * envelope. Used by Orders for price lookups and availability checks.
   */
  getAllInternal: function () {
    const rows = Utils.readAllRows(CONFIG.SHEETS.PRODUCTS);
    return rows.map(Products._rowToProduct);
  },

  /**
   * Internal — returns a single product object, or null.
   */
  findByIdInternal: function (id) {
    if (!id) return null;
    const target = String(id);
    return Products.getAllInternal().find(function (p) { return p.id === target; }) || null;
  },
  /**
   * Converts a raw sheet row into the public product shape.
   * Must stay in sync with the shape used by the frontend (js/products.js).
   */
  _rowToProduct: function (row) {
    return {
      id:          Utils.asString(row.id),
      name:        Utils.asString(row.name),
      slug:        Utils.asString(row.slug),
      description: Utils.asString(row.description),
      category:    Utils.asString(row.category),
      occasion:    Utils.asString(row.occasion),
      price:       Utils.asNumber(row.price, 0),
      image:       Utils.asString(row.image),
      rating:      Utils.asNumber(row.rating, 0),
      featured:    Utils.parseBool(row.featured),
      active:      Utils.parseBool(row.active),
    };
  },
};