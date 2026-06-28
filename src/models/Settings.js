const { Schema, model } = require('mongoose');

// Singleton document for global bot configuration
const SettingsSchema = new Schema({
  _id: { type: String, default: 'global' },

  // ===== STORE INFO =====
  storeName: { type: String, default: 'DIGITAL STORE' },
  storeSubtitle: { type: String, default: 'Premium Auto Order' },
  storeDescription: { type: String, default: '' },
  welcomeMessage: { type: String, default: '👋 Selamat datang di toko kami!' },
  homeBannerFileId: String,
  homeBannerCaption: String,
  footer: { type: String, default: '© Digital Store' },
  adminUsername: { type: String, default: '' },
  channelLink: { type: String, default: '' },
  groupLink: { type: String, default: '' },
  helpLink: { type: String, default: '' },
  operationalHours: { type: String, default: '24/7' },
  contactInfo: { type: String, default: '' },

  // ===== BOT PROFILE =====
  botName: { type: String, default: 'Digital Store Bot' },
  botCaptionHome: { type: String, default: '' },
  botHeader: { type: String, default: '' },
  botFooter: { type: String, default: '' },
  botEmoji: { type: String, default: '🏪' },

  // ===== JOIN CHANNEL (multi) =====
  joinChannelRequired: { type: Boolean, default: false },
  channelId: { type: String, default: '' },     // primary (back compat)
  channelTitle: { type: String, default: '' },
  joinChannels: {
    type: [{ channelId: String, title: String, link: String }],
    default: [],
  },
  joinMessage: { type: String, default: '🔒 Silakan join channel kami terlebih dahulu untuk melanjutkan.' },

  // ===== RESI CHANNEL =====
  resiChannelId: { type: String, default: '' },
  resiAutoForward: { type: Boolean, default: false },
  resiCaption: { type: String, default: '🧾 Resi pengiriman order {invoice}\n📦 {product} ×{qty}\n💰 {total}' },

  // ===== AUTO CANCEL / EXPIRY =====
  invoiceExpiryMinutes: { type: Number, default: 30 },

  // ===== FEATURE TOGGLES =====
  autoDelivery: { type: Boolean, default: true },
  autoDeliveryDelaySec: { type: Number, default: 0 },
  autoDeliveryTemplate: { type: String, default: '📥 <b>Akun {n}</b>\n<code>{content}</code>' },
  manualPaymentEnabled: { type: Boolean, default: true },
  gatewayPaymentEnabled: { type: Boolean, default: false },
  broadcastEnabled: { type: Boolean, default: true },
  adminNotificationEnabled: { type: Boolean, default: true },
  maintenanceMode: { type: Boolean, default: false },
  maintenanceAllowAdmin: { type: Boolean, default: true },
  maintenanceBannerFileId: { type: String, default: '' },
  maintenanceBannerCaption: { type: String, default: '' },
  storeClosed: { type: Boolean, default: false },

  // ===== PRODUCT SETTINGS =====
  productMinQty: { type: Number, default: 1 },
  productMaxQty: { type: Number, default: 10 },
  productFIFO: { type: Boolean, default: true },
  productStockReservation: { type: Boolean, default: true },
  productAutoNumbering: { type: Boolean, default: true },
  productPageSize: { type: Number, default: 8 },
  productLayout: { type: String, default: 'list' }, // list | grid

  // ===== NOTIFICATIONS =====
  notifNewUser: { type: Boolean, default: true },
  notifNewOrder: { type: Boolean, default: true },
  notifPayment: { type: Boolean, default: true },
  notifStockOut: { type: Boolean, default: true },
  notifBroadcast: { type: Boolean, default: false },
  notifError: { type: Boolean, default: true },
  notifAdminLogin: { type: Boolean, default: false },

  // ===== APPEARANCE =====
  uiHeader: { type: String, default: '' },
  uiFooter: { type: String, default: '' },
  uiSeparator: { type: String, default: '━━━━━━━━━━━━' },
  uiEmoji: { type: String, default: '🛍' },
  uiLayout: { type: String, default: 'compact' }, // compact | spacious

  // ===== PER-MENU BANNERS =====
  menuBanners: {
    type: Map,
    of: new Schema({ fileId: String, caption: String }, { _id: false }),
    default: {},
  },

  // ===== MESSAGE TEMPLATES =====
  tplWelcome: { type: String, default: '👋 Selamat datang, {name}!' },
  tplInvoice: { type: String, default: '🧾 Invoice {invoice}\n📦 {product} ×{qty}\n💰 {total}' },
  tplPaymentSuccess: { type: String, default: '✅ Pembayaran berhasil! Produk telah dikirim.' },
  tplPaymentFailed: { type: String, default: '❌ Pembayaran gagal atau dibatalkan.' },
  tplOrderNew: { type: String, default: '🆕 Order baru dibuat.' },
  tplProductDelivered: { type: String, default: '📦 Produk Anda telah dikirim. Terima kasih!' },
  tplStockOut: { type: String, default: '⚠️ Stock habis.' },
  tplJoinChannel: { type: String, default: '🔒 Anda harus bergabung ke channel terlebih dahulu.' },
  tplMaintenance: { type: String, default: '🛠 Bot sedang maintenance. Coba lagi nanti.' },
  tplStoreClosed: { type: String, default: '🔒 Toko sedang tutup.' },
  tplBroadcast: { type: String, default: '📢 {message}' },
  tplError: { type: String, default: '⚠️ Terjadi kesalahan: {error}' },

  // ===== Menu config (admin can rename/toggle/reorder) =====
  menus: {
    type: [{
      key: String,
      label: String,
      enabled: { type: Boolean, default: true },
      order: { type: Number, default: 0 },
    }],
    default: [
      { key: 'products', label: '📦 Semua Produk', enabled: true, order: 1 },
      { key: 'orders',   label: '📜 Pesanan Saya', enabled: true, order: 2 },
      { key: 'payments', label: '💳 Pembayaran Saya', enabled: true, order: 3 },
      { key: 'history',  label: '📋 Riwayat Pesanan', enabled: true, order: 4 },
      { key: 'contact',  label: '📞 Hubungi Admin', enabled: true, order: 5 },
      { key: 'info',     label: 'ℹ️ Informasi', enabled: true, order: 6 },
    ],
  },
}, { timestamps: true });

SettingsSchema.statics.get = async function () {
  let s = await this.findById('global');
  if (!s) s = await this.create({ _id: 'global' });
  return s;
};

module.exports = model('Settings', SettingsSchema);
