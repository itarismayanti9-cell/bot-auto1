const { Telegraf, Markup } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const session = require('./middleware/session');
const ratelimit = require('./middleware/ratelimit');
const banned = require('./middleware/banned');
const maintenance = require('./middleware/maintenance');
const joinChannel = require('./middleware/joinChannel');
const { requireAdmin, isAdmin } = require('./middleware/auth');
const log = require('./utils/logger');

const home = require('./handlers/home');
const user = require('./handlers/user');
const admin = require('./handlers/admin');
const advanced = require('./handlers/adminAdvanced');
const autogopayAdmin = require('./handlers/adminAutogopay');

const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 60_000 });

// Global error handler
bot.catch((err, ctx) => {
  log.error('Telegraf error', err);
  try { ctx.reply('⚠️ Terjadi kesalahan, silakan coba lagi.'); } catch {}
});

// Middleware
bot.use(ratelimit);
bot.use(session);
bot.use(banned);
bot.use(maintenance);

// noop for inactive buttons
bot.action('noop', async (ctx) => { try { await ctx.answerCbQuery(); } catch {} });

// ===== COMMANDS =====
bot.start(joinChannel, async (ctx) => home.showHome(ctx));
bot.command('start', joinChannel, async (ctx) => home.showHome(ctx));
bot.command('menu', joinChannel, async (ctx) => home.showHome(ctx));

bot.command('admin', requireAdmin, async (ctx) => {
  try { await ctx.deleteMessage(ctx.message.message_id); } catch {}
  return admin.showPanel(ctx);
});

// ===== USER CALLBACKS =====
bot.action('home', joinChannel, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return home.showHome(ctx); });
bot.action('jc:check', async (ctx) => {
  try { await ctx.answerCbQuery('Mengecek...'); } catch {}
  return home.showHome(ctx);
});

bot.action(/^m:(\w+)$/, joinChannel, async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}
  const key = ctx.match[1];
  if (key === 'products') return user.showProducts(ctx);
  if (key === 'orders')   return user.listOrders(ctx, 'active');
  if (key === 'payments') return user.listPayments(ctx);
  if (key === 'history')  return user.listOrders(ctx, 'history');
  if (key === 'contact')  return user.showContact(ctx);
  if (key === 'info')     return user.showInfo(ctx);
  return home.showHome(ctx);
});

bot.action(/^ps:(\d+)$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.showProducts(ctx, +ctx.match[1]); });
bot.action(/^p:([a-f0-9]{24})$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.showProductDetail(ctx, ctx.match[1]); });
bot.action(/^b:([a-f0-9]{24})$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.showQtyPicker(ctx, ctx.match[1]); });
bot.action(/^q:([a-f0-9]{24}):(\d+)$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.showOrderConfirm(ctx, ctx.match[1], +ctx.match[2]); });
bot.action(/^qc:([a-f0-9]{24})$/, joinChannel, async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}
  ctx.state.user.state = { customQty: ctx.match[1] }; await ctx.state.user.save();
  const { box } = require('./utils/ui');
  return require('./utils/safeEdit').safeEdit(ctx, box('✏️ CUSTOM JUMLAH', ['Kirim jumlah pembelian (angka):']),
    Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', `b:${ctx.match[1]}`)]]));
});
bot.action(/^pay:([a-f0-9]{24}):(\d+)$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.startPayment(ctx, ctx.match[1], +ctx.match[2]); });
bot.action(/^o:(INV-[\w-]+)$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.showInvoice(ctx, ctx.match[1]); });
bot.action(/^od:(INV-[\w-]+)$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.showOrderDetail(ctx, ctx.match[1]); });
bot.action(/^pm:(INV-[\w-]+):(\w+)$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.selectPaymentMethod(ctx, ctx.match[1], ctx.match[2]); });
bot.action(/^agcheck:(INV-[\w-]+)$/, joinChannel, async (ctx) => user.checkAutogopayStatus(ctx, ctx.match[1]));
bot.action(/^ocancel:(INV-[\w-]+)$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.cancelOrder(ctx, ctx.match[1]); });
bot.action(/^oredeliver:(INV-[\w-]+)$/, joinChannel, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return user.redeliver(ctx, ctx.match[1]); });

// Admin payment verification (works in DM with admin)
bot.action(/^vpay:([a-f0-9]{24}):(approve|reject)$/, requireAdmin, async (ctx) =>
  admin.verifyPayment(ctx, ctx.match[1], ctx.match[2])
);

// ===== ADMIN CALLBACKS =====
bot.action('admin', requireAdmin, async (ctx) => { try { await ctx.answerCbQuery(); } catch {}; return admin.showPanel(ctx); });
bot.action(/^a:(\w+)$/, requireAdmin, async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}
  const k = ctx.match[1];
  switch (k) {
    case 'dash':   return admin.showDashboard(ctx);
    case 'prod':   return admin.showProductList(ctx);
    case 'stock':  return admin.showStockMenu(ctx);
    case 'banner': return admin.showBannerMenu(ctx);
    case 'pay':    return admin.showPaymentMenu(ctx);
    case 'bc':     return admin.showBroadcastMenu(ctx);
    case 'user':   return admin.showUserMenu(ctx);
    case 'set':    return advanced.showHub(ctx);
    case 'tpl':    return advanced.handleAction(ctx, ['adv','tpl']);
    case 'menu':   return admin.showMenuConfig(ctx);
    case 'log':    return admin.showAuditLog(ctx);
    case 'close':  try { await ctx.deleteMessage(); } catch {} ; return;
    default: return admin.showPanel(ctx);
  }
});

// Product admin
bot.action(/^aps:(\d+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.showProductList(ctx, +ctx.match[1]); });
bot.action(/^ap:new$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.newProductFlow(ctx); });
bot.action(/^ap:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.showProductAdmin(ctx, ctx.match[1]); });
bot.action(/^ape:([a-f0-9]{24}):(name|price|desc|banner)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.editProductFlow(ctx, ctx.match[1], ctx.match[2]); });
bot.action(/^apt:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Toggled').catch(()=>{}); return admin.toggleProduct(ctx, ctx.match[1]); });
bot.action(/^apd:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Deleted').catch(()=>{}); return admin.deleteProduct(ctx, ctx.match[1]); });

// Stock admin
bot.action(/^as:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.showProductStock(ctx, ctx.match[1]); });
bot.action(/^ast:([a-f0-9]{24}):(add|import|export|clear)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.stockAction(ctx, ctx.match[1], ctx.match[2]); });
bot.action(/^as_done:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Selesai').catch(()=>{}); return admin.stockAddDone(ctx, ctx.match[1]); });
bot.action(/^as_cancel:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Dibatalkan').catch(()=>{}); return admin.stockAddCancel(ctx, ctx.match[1]); });

// Banner
bot.action(/^ab:(home):(upload|caption|remove)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.bannerAction(ctx, ctx.match[1], ctx.match[2]); });

// Payment methods
bot.action(/^apm:new$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.newPaymentMethodFlow(ctx); });
bot.action(/^apmn:(\w+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.paymentMethodGuide(ctx, ctx.match[1]); });
bot.action(/^apmc:(\w+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Dibuat').catch(()=>{}); return admin.paymentMethodCreate(ctx, ctx.match[1]); });
bot.action(/^apm:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.showPaymentMethodDetail(ctx, ctx.match[1]); });
bot.action(/^apme:([a-f0-9]{24}):(\w+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.editPaymentMethodFlow(ctx, ctx.match[1], ctx.match[2]); });
bot.action(/^apmt:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Toggled').catch(()=>{}); return admin.togglePM(ctx, ctx.match[1]); });
bot.action(/^apmd:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Deleted').catch(()=>{}); return admin.deletePM(ctx, ctx.match[1]); });

// Broadcast
bot.action(/^abc:(\w+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.broadcastStart(ctx, ctx.match[1]); });
bot.action(/^abcp:([a-f0-9]{24})$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.broadcastProduct(ctx, ctx.match[1]); });

// Users
bot.action('au:search', requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.userSearchFlow(ctx); });
bot.action('au:list', requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.listUsers(ctx); });
bot.action(/^au:(\d+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.showUserDetail(ctx, ctx.match[1]); });
bot.action(/^aub:(\d+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Toggled').catch(()=>{}); return admin.toggleBan(ctx, ctx.match[1]); });

// Settings
bot.action(/^asn:(\w+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.editSettingFlow(ctx, ctx.match[1]); });
bot.action(/^ast:(\w+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Toggled').catch(()=>{}); return admin.toggleSetting(ctx, ctx.match[1]); });

// Menu user config
bot.action(/^amk:(\w+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.menuActions(ctx, ctx.match[1]); });
bot.action(/^amt:(\w+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery('Toggled').catch(()=>{}); return admin.toggleMenu(ctx, ctx.match[1]); });
bot.action(/^amr:(\w+)$/, requireAdmin, (ctx) => { ctx.answerCbQuery().catch(()=>{}); return admin.renameMenuFlow(ctx, ctx.match[1]); });

// ===== AUTOGOPAY CONFIG =====
bot.action(/^apag:(.+)$/, requireAdmin, async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}
  const parts = ('apag:' + ctx.match[1]).split(':');
  return autogopayAdmin.handleAction(ctx, parts);
});

// ===== ADVANCED SETTINGS (Pengaturan Lanjutan) =====
bot.action(/^adv:(.+)$/, requireAdmin, async (ctx) => {
  try { await ctx.answerCbQuery(); } catch {}
  const parts = ('adv:' + ctx.match[1]).split(':');
  return advanced.handleAction(ctx, parts);
});

// ===== TEXT / PHOTO / DOCUMENT handlers =====
bot.on('photo', async (ctx) => {
  const u = ctx.state.user;
  const st = u.state || {};
  // user uploading payment proof
  if (st.awaitingProof) return user.receiveProof(ctx);
  // admin upload flows
  if (isAdmin(ctx.from.id) && st.admin) {
    if (st.admin.startsWith('adv_')) {
      const handled = await advanced.handlePhoto(ctx);
      if (handled) return;
    }
    const handled = await admin.handlePhoto(ctx);
    if (handled) return;
  }
});

bot.on('document', async (ctx) => {
  if (isAdmin(ctx.from.id)) {
    const st = ctx.state.user.state || {};
    if (st.admin && st.admin.startsWith('adv_')) {
      const handled = await advanced.handleDocument(ctx);
      if (handled) return;
    }
    const handled = await admin.handleDocument(ctx);
    if (handled) return;
  }
});

bot.on('text', async (ctx) => {
  const u = ctx.state.user;
  const st = u.state || {};

  // user custom quantity input
  if (st.customQty) {
    const productId = st.customQty;
    const qty = parseInt((ctx.message.text||'').replace(/\D/g,''), 10);
    const { deleteUserMessage } = require('./utils/safeEdit');
    await deleteUserMessage(ctx);
    u.state = {}; await u.save();
    if (!qty || qty < 1) {
      const { err } = require('./utils/ui');
      const { sendMain } = require('./utils/safeEdit');
      return sendMain(ctx, err('Invalid', 'Jumlah harus minimal 1.'), Markup.inlineKeyboard([[Markup.button.callback('🔄 Coba Lagi', `b:${productId}`)]]));
    }
    return user.showOrderConfirm(ctx, productId, qty);
  }

  // admin state machine
  if (isAdmin(ctx.from.id) && st.admin) {
    if (st.admin.startsWith('autogopay_')) {
      const handled = await autogopayAdmin.handleText(ctx);
      if (handled) return;
    }
    if (st.admin.startsWith('adv_')) {
      const handled = await advanced.handleText(ctx);
      if (handled) return;
    }
    const handled = await admin.handleText(ctx);
    if (handled) return;
  }
});

module.exports = bot;
