const { Markup } = require('telegraf');
const Settings = require('../models/Settings');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { box } = require('../utils/ui');
const { safeEdit, sendMain, sendPhoto } = require('../utils/safeEdit');
const { isAdmin } = require('../middleware/auth');

async function buildHomeKeyboard() {
  const s = await Settings.get();
  const enabled = (s.menus || []).filter(m => m.enabled).sort((a,b) => a.order - b.order);
  const rows = [];
  for (let i = 0; i < enabled.length; i += 2) {
    const row = [];
    row.push(Markup.button.callback(enabled[i].label, `m:${enabled[i].key}`));
    if (enabled[i+1]) row.push(Markup.button.callback(enabled[i+1].label, `m:${enabled[i+1].key}`));
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
}

async function buildHomeText(ctx) {
  const s = await Settings.get();
  const u = ctx.state.user;
  const totalProducts = await Product.countDocuments({ active: true });
  const totalOrders = await Order.countDocuments({ userId: u.telegramId });
  const role = isAdmin(u.telegramId) ? 'Admin' : (u.banned ? 'Banned' : 'Member');
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'User';

  if (s.maintenanceMode && !(isAdmin(u.telegramId) && s.maintenanceAllowAdmin !== false)) {
    return box('🛠 MAINTENANCE', [s.tplMaintenance]);
  }
  if (s.storeClosed && !isAdmin(u.telegramId)) {
    return box('🔒 TOKO TUTUP', [s.tplStoreClosed]);
  }

  const text = [
    `🏪 <b>${s.storeName}</b> · <i>${s.storeSubtitle || ''}</i>`,
    `👋 Hi, <b>${name}</b>`,
    ``,
    `👤 ${role}  ·  📦 ${totalProducts} produk  ·  📜 ${totalOrders} order`,
    s.welcomeMessage ? `\n${s.welcomeMessage}` : '',
    s.footer ? `\n<i>${s.footer}</i>` : '',
  ].filter(Boolean).join('\n');
  return text;
}

async function showHome(ctx) {
  const text = await buildHomeText(ctx);
  const kb = await buildHomeKeyboard();
  const s = await Settings.get();
  const mb = s.menuBanners ? (s.menuBanners.get ? s.menuBanners.get('home') : s.menuBanners.home) : null;
  const fileId = (mb && mb.fileId) || s.homeBannerFileId;
  if (fileId && !ctx.callbackQuery) {
    return sendPhoto(ctx, fileId, text, kb);
  }
  if (ctx.callbackQuery) {
    const { editOrPhoto } = require('../utils/safeEdit');
    return editOrPhoto(ctx, fileId, text, kb);
  }
  return sendMain(ctx, text, kb);
}

module.exports = { showHome, buildHomeText, buildHomeKeyboard };
