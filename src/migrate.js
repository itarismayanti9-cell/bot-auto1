// Startup migration: drop stale indexes from prior schema versions.
// Specifically handles `orders.invoiceNo_1` unique index leftover that conflicts
// with the current schema (which uses `invoice`).
const log = require('./utils/logger');

const STALE_INDEXES = {
  orders: ['invoiceNo_1'],
};

async function dropStaleIndexes(mongoose) {
  const db = mongoose.connection.db;
  if (!db) return;
  for (const [collName, indexNames] of Object.entries(STALE_INDEXES)) {
    try {
      const coll = db.collection(collName);
      const existing = await coll.indexes().catch(() => []);
      for (const ix of existing) {
        if (indexNames.includes(ix.name)) {
          try {
            await coll.dropIndex(ix.name);
            log.info(`🧹 Dropped stale index ${collName}.${ix.name}`);
          } catch (e) {
            log.warn(`Could not drop ${collName}.${ix.name}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      log.warn(`migrate ${collName}: ${e.message}`);
    }
  }
}

module.exports = { dropStaleIndexes, seedAutogopay };

// Seed AutoGoPay payment method with safe defaults (idempotent).
// Admin can override Raw QRIS and API Key anytime from Admin Panel.
async function seedAutogopay() {
  try {
    const PaymentMethod = require('./models/PaymentMethod');
    const autogopay = require('./services/autogopay');
    const existing = await PaymentMethod.findOne({ code: 'autogopay' });
    if (existing) {
      // Ensure default rawQris is present if missing
      existing.config = existing.config || {};
      let changed = false;
      if (!existing.config.rawQris) { existing.config.rawQris = autogopay.DEFAULT_RAW_QRIS; changed = true; }
      if (existing.config.apiKey === undefined) { existing.config.apiKey = ''; changed = true; }
      if (changed) { existing.markModified('config'); await existing.save(); }
      return;
    }
    await PaymentMethod.create({
      code: 'autogopay',
      label: '🟢 AutoGoPay',
      type: 'gateway',
      active: false,
      sortOrder: 99,
      instructions: 'Pembayaran otomatis via QRIS Dinamis AutoGoPay. Scan QRIS untuk membayar — verifikasi otomatis.',
      config: { rawQris: autogopay.DEFAULT_RAW_QRIS, apiKey: '' },
    });
    require('./utils/logger').info('🌱 Seeded AutoGoPay payment method (inactive)');
  } catch (e) {
    require('./utils/logger').warn('seedAutogopay', e.message);
  }
}
