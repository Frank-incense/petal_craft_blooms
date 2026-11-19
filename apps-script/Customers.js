/**
 * Petal Craft Blooms — Customers module
 * Phase 6B: guest-friendly lookup and creation, keyed by phone.
 * Passwords and login arrive in Phase 12.
 */

const Customers = {
  /**
   * Finds a customer by normalised phone. Creates one if none exists.
   * Never throws — worst case creates a new record.
   */
  findOrCreateByPhone: function (phone, fullName, email) {
    const normalised = Utils.normalisePhone(phone);
    if (!normalised) {
      return { id: '', full_name: fullName || '', phone: phone || '', email: email || '' };
    }

    const rows = Utils.readAllRows(CONFIG.SHEETS.CUSTOMERS);
    const existing = rows.find(function (r) {
      return Utils.normalisePhone(r.phone) === normalised;
    });

    if (existing) {
      // The phone is the identity. Name and email are the latest
      // information we have about this person — keep them current.
      const newName  = (fullName || '').trim();
      const newEmail = (email || '').trim();
      const changed =
        (newName  && newName  !== String(existing.full_name || '')) ||
        (newEmail && newEmail !== String(existing.email     || ''));

      if (changed) {
        if (newName)  existing.full_name = newName;
        if (newEmail) existing.email     = newEmail;
        existing.updated_at = Utils.now();

        const rowNum = Utils.findRowByColumn(CONFIG.SHEETS.CUSTOMERS, 'id', existing.id);
        if (rowNum > 0) Utils.updateRow(CONFIG.SHEETS.CUSTOMERS, rowNum, existing);
      }
      return existing;
    }

    const now = Utils.now();
    const customer = {
      id:             Utils.generateId('cust'),
      full_name:      (fullName || '').trim(),
      phone:          phone,     // stored as provided — matching uses normalised form
      email:          (email || '').trim(),
      password_hash:  '',
      password_salt:  '',
      default_address:'',
      default_zone:   '',
      created_at:     now,
      updated_at:     now,
      last_login:     '',
    };
    Utils.appendRow(CONFIG.SHEETS.CUSTOMERS, customer);
    return customer;
  },

  getById: function (id) {
    if (!id) return null;
    const rows = Utils.readAllRows(CONFIG.SHEETS.CUSTOMERS);
    return rows.find(function (r) { return String(r.id) === String(id); }) || null;
  },
};