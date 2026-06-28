// Pengaturan Lanjutan — Configuration Center
// Each submenu opens its own page via editMessage (no sendMessage spam).
const { Markup } = require('telegraf');
const Settings = require('../models/Settings');
const PaymentMethod = require('../models/PaymentMethod');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { box, ok, err } = require('../utils/ui');
const { safeEdit, sendMain, deleteUserMessage } = require('../utils/safeEdit');
const log = require('../utils/logger');

const back = (cb) => Markup.button.callback('⬅️ Kembali', cb);
const onOff = (v) => (v ? '🟢 ON' : '🔴 OFF');

async function audit(actorId, action, target, meta = {}) {
  await AuditLog.create({ actorId, actorRole: 'admin', action, target, meta }).catch(()=>{});
}

// ===== MAIN HUB =====
// ===== BANNER PER-MENU =====
const MENU_BANNER_KEYS = [
  ['home', '🏠 Beranda'],
  ['products', '📦 Semua Produk'],
  ['orders', '📜 Pesanan Saya'],
  ['payments', '💳 Pembayaran Saya'],
  ['history', '📋 Riwayat Pesanan'],
  ['contact', '📞 Hubungi Admin'],
  ['info', 'ℹ️ Informasi'],
];

async function showMenuBanners(ctx) {
  const s = await Settings.get();
  const lines = MENU_BANNER_KEYS.map(([k, l]) => {
    const b = (s.menuBanners && s.menuBanners.get) ? s.menuBanners.get(k) : (s.menuBanners||{})[k];
    return `${b && b.fileId ? '🟢' : '⚪'} ${l}${b && b.caption ? `\n   <i>${b.caption.slice(0,40)}</i>` : ''}`;
  });
  const rows = MENU_BANNER_KEYS.map(([k, l]) => [Markup.button.callback(l, `adv:mb:${k}`)]);
  rows.push([back('a:set')]);
  return safeEdit(ctx, box('🖼 BANNER PER-MENU', lines), Markup.inlineKeyboard(rows));
}

async function showMenuBannerDetail(ctx, key) {
  const s = await Settings.get();
  const b = (s.menuBanners && s.menuBanners.get) ? s.menuBanners.get(key) : (s.menuBanners||{})[key];
  const label = (MENU_BANNER_KEYS.find(x => x[0] === key) || [key, key])[1];
  const lines = [
    `Menu : <b>${label}</b>`,
    `Banner : ${b && b.fileId ? '✅ Ada' : '❌ Belum'}`,
    b && b.caption ? `\n📝 ${b.caption}` : '',
  ];
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🖼 Upload Banner', `adv:mb:${key}:upload`)],
    [Markup.button.callback('📝 Edit Caption', `adv:mb:${key}:caption`)],
    [Markup.button.callback('🗑 Hapus Banner', `adv:mb:${key}:remove`)],
    [back('adv:mbanner')],
  ]);
  return safeEdit(ctx, box('🖼 ' + label, lines), kb);
}

async function showHub(ctx) {
  const text = box('⚙️ PENGATURAN LANJUTAN', ['<i>Configuration Center — semua konfigurasi bot di sini.</i>']);
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('💳 Multi Pembayaran', 'a:pay'),
     Markup.button.callback('📢 Channel Wajib Join', 'adv:join')],
    [Markup.button.callback('🧾 Channel Resi', 'adv:resi'),
     Markup.button.callback('⏰ Auto Cancel Order', 'adv:cancel')],
    [Markup.button.callback('🏪 Informasi Toko', 'adv:store'),
     Markup.button.callback('👤 Profil Bot', 'adv:bot')],
    [Markup.button.callback('🖼 Banner Beranda', 'a:banner'),
     Markup.button.callback('🖼 Banner per-Menu', 'adv:mbanner')],
    [Markup.button.callback('📝 Template Pesan', 'adv:tpl'),
     Markup.button.callback('📦 Pengaturan Produk', 'adv:prod')],
    [Markup.button.callback('🚚 Auto Delivery', 'adv:deliv'),
     Markup.button.callback('🔔 Notifikasi', 'adv:notif')],
    [Markup.button.callback('🎨 Tampilan Bot', 'adv:ui'),
     Markup.button.callback('🛠 Maintenance Mode', 'adv:maint')],
    [Markup.button.callback('💾 Backup & Restore', 'adv:backup'),
     Markup.button.callback('🗂 Menu User (Label)', 'a:menu')],
    [back('admin')],
  ]);
  return safeEdit(ctx, text, kb);
}

// ===== CHANNEL WAJIB JOIN =====
async function showJoin(ctx) {
  const s = await Settings.get();
  const list = (s.joinChannels && s.joinChannels.length)
    ? s.joinChannels.map((c, i) => `${i+1}. ${c.title || c.channelId} — <code>${c.channelId}</code>`)
    : (s.channelId ? [`1. ${s.channelTitle || s.channelId} — <code>${s.channelId}</code>`] : ['<i>Belum ada channel</i>']);
  const text = box('📢 CHANNEL WAJIB JOIN', [
    `Status : ${onOff(s.joinChannelRequired)}`,
    `Jumlah Channel: <b>${(s.joinChannels?.length) || (s.channelId ? 1 : 0)}</b>`,
    '', '<b>Daftar Channel:</b>', ...list,
    '', `Pesan Join:`, `<i>${s.joinMessage}</i>`,
  ]);
  const rows = [
    [Markup.button.callback(s.joinChannelRequired ? '⛔ Nonaktifkan' : '✅ Aktifkan', 'adv:join:toggle')],
    [Markup.button.callback('➕ Tambah Channel', 'adv:join:add'),
     Markup.button.callback('🔄 Ganti Primary', 'adv:join:primary')],
  ];
  (s.joinChannels || []).forEach((c, i) => {
    rows.push([Markup.button.callback(`🗑 Hapus #${i+1} ${c.title||c.channelId}`, `adv:join:del:${i}`)]);
  });
  rows.push([Markup.button.callback('📝 Edit Pesan Join', 'adv:join:msg')]);
  rows.push([back('a:set')]);
  return safeEdit(ctx, text, Markup.inlineKeyboard(rows));
}

// ===== CHANNEL RESI =====
async function showResi(ctx) {
  const s = await Settings.get();
  const text = box('🧾 CHANNEL RESI', [
    `Channel : <code>${s.resiChannelId || '-'}</code>`,
    `Auto Forward: ${onOff(s.resiAutoForward)}`,
    '', '<b>Caption:</b>', `<i>${s.resiCaption}</i>`,
    '', '<i>Placeholder: {invoice} {product} {qty} {total} {user}</i>',
  ]);
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Ganti Channel', 'adv:resi:ch')],
    [Markup.button.callback(s.resiAutoForward ? '⛔ Nonaktifkan Forward' : '✅ Aktifkan Forward', 'adv:resi:toggle')],
    [Markup.button.callback('📝 Edit Caption', 'adv:resi:cap')],
    [back('a:set')],
  ]);
  return safeEdit(ctx, text, kb);
}

// ===== AUTO CANCEL ORDER =====
async function showCancel(ctx) {
  const s = await Settings.get();
  const text = box('⏰ AUTO CANCEL ORDER', [
    `Saat ini: <b>${s.invoiceExpiryMinutes}</b> menit`,
    '', '<i>Invoice akan otomatis expired & stock dikembalikan saat waktu habis.</i>',
  ]);
  const presets = [5, 10, 15, 30, 60];
  const rows = [
    presets.map(m => Markup.button.callback(`${m === 60 ? '1 jam' : m+' mnt'}${m===s.invoiceExpiryMinutes?' ✅':''}`, `adv:cancel:set:${m}`)),
    [Markup.button.callback('✏️ Custom', 'adv:cancel:custom')],
    [back('a:set')],
  ];
  return safeEdit(ctx, text, Markup.inlineKeyboard(rows));
}

// ===== INFORMASI TOKO =====
async function showStore(ctx) {
  const s = await Settings.get();
  const text = box('🏪 INFORMASI TOKO', [
    `Nama       : <b>${s.storeName}</b>`,
    `Subtitle   : ${s.storeSubtitle}`,
    `Deskripsi  : ${s.storeDescription || '-'}`,
    `Kontak     : ${s.contactInfo || '-'}`,
    `Admin      : @${(s.adminUsername||'').replace(/^@/,'') || '-'}`,
    `Channel    : ${s.channelLink || '-'}`,
    `Grup       : ${s.groupLink || '-'}`,
    `Jam Op.    : ${s.operationalHours}`,
    `Footer     : ${s.footer || '-'}`,
  ]);
  const F = (l, f) => Markup.button.callback(l, `adv:set:${f}`);
  const kb = Markup.inlineKeyboard([
    [F('✏️ Nama Toko', 'storeName'), F('📝 Subtitle', 'storeSubtitle')],
    [F('📄 Deskripsi', 'storeDescription'), F('📞 Kontak', 'contactInfo')],
    [F('👤 Admin Username', 'adminUsername'), F('🕒 Jam Op.', 'operationalHours')],
    [F('🔗 Channel Link', 'channelLink'), F('💬 Grup Link', 'groupLink')],
    [F('📜 Footer', 'footer')],
    [back('a:set')],
  ]);
  return safeEdit(ctx, text, kb);
}

// ===== PROFIL BOT =====
async function showBotProfile(ctx) {
  const s = await Settings.get();
  const text = box('👤 PROFIL BOT', [
    `Nama Bot     : <b>${s.botName}</b>`,
    `Emoji        : ${s.botEmoji}`,
    `Header       : ${s.botHeader || '-'}`,
    `Footer       : ${s.botFooter || '-'}`,
    `Caption Home : ${s.botCaptionHome || '-'}`,
    `Welcome Msg  : ${s.welcomeMessage}`,
  ]);
  const F = (l, f) => Markup.button.callback(l, `adv:set:${f}`);
  const kb = Markup.inlineKeyboard([
    [F('✏️ Nama Bot', 'botName'), F('😀 Emoji', 'botEmoji')],
    [F('📝 Header', 'botHeader'), F('📜 Footer', 'botFooter')],
    [F('🖼 Caption Beranda', 'botCaptionHome'), F('👋 Welcome', 'welcomeMessage')],
    [back('a:set')],
  ]);
  return safeEdit(ctx, text, kb);
}

// ===== TEMPLATE PESAN =====
const TPL_FIELDS = [
  { f: 'tplWelcome', label: 'Welcome' },
  { f: 'tplInvoice', label: 'Invoice' },
  { f: 'tplPaymentSuccess', label: 'Pembayaran Berhasil' },
  { f: 'tplPaymentFailed', label: 'Pembayaran Gagal' },
  { f: 'tplOrderNew', label: 'Order Baru' },
  { f: 'tplProductDelivered', label: 'Produk Terkirim' },
  { f: 'tplStockOut', label: 'Stock Habis' },
  { f: 'tplJoinChannel', label: 'Join Channel' },
  { f: 'tplBroadcast', label: 'Broadcast' },
  { f: 'tplError', label: 'Error' },
];
async function showTpl(ctx) {
  const s = await Settings.get();
  const text = box('📝 TEMPLATE PESAN', TPL_FIELDS.map(t => `<b>${t.label}</b>: <i>${(s[t.f]||'').slice(0,60)}</i>`));
  const rows = [];
  for (let i = 0; i < TPL_FIELDS.length; i += 2) {
    const row = [Markup.button.callback(`✏️ ${TPL_FIELDS[i].label}`, `adv:set:${TPL_FIELDS[i].f}`)];
    if (TPL_FIELDS[i+1]) row.push(Markup.button.callback(`✏️ ${TPL_FIELDS[i+1].label}`, `adv:set:${TPL_FIELDS[i+1].f}`));
    rows.push(row);
  }
  rows.push([back('a:set')]);
  return safeEdit(ctx, text, Markup.inlineKeyboard(rows));
}

// ===== PENGATURAN PRODUK =====
async function showProd(ctx) {
  const s = await Settings.get();
  const text = box('📦 PENGATURAN PRODUK', [
    `Min Qty           : <b>${s.productMinQty}</b>`,
    `Max Qty           : <b>${s.productMaxQty}</b>`,
    `FIFO              : ${onOff(s.productFIFO)}`,
    `Stock Reservation : ${onOff(s.productStockReservation)}`,
    `Auto Numbering    : ${onOff(s.productAutoNumbering)}`,
    `Page Size         : <b>${s.productPageSize}</b>`,
    `Layout            : <b>${s.productLayout}</b>`,
  ]);
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Min Qty', 'adv:set:productMinQty'),
     Markup.button.callback('✏️ Max Qty', 'adv:set:productMaxQty')],
    [Markup.button.callback(`FIFO ${onOff(s.productFIFO)}`, 'adv:tg:productFIFO'),
     Markup.button.callback(`Reserve ${onOff(s.productStockReservation)}`, 'adv:tg:productStockReservation')],
    [Markup.button.callback(`Auto# ${onOff(s.productAutoNumbering)}`, 'adv:tg:productAutoNumbering'),
     Markup.button.callback('✏️ Page Size', 'adv:set:productPageSize')],
    [Markup.button.callback(`Layout: ${s.productLayout}`, 'adv:prod:layout')],
    [back('a:set')],
  ]);
  return safeEdit(ctx, text, kb);
}

// ===== AUTO DELIVERY =====
async function showDeliv(ctx) {
  const s = await Settings.get();
  const text = box('🚚 AUTO DELIVERY', [
    `Status      : ${onOff(s.autoDelivery)}`,
    `Delay       : <b>${s.autoDeliveryDelaySec}</b> detik`,
    '', '<b>Template:</b>', `<i>${s.autoDeliveryTemplate}</i>`,
    '', '<i>Placeholder: {n} {content} {invoice} {product}</i>',
  ]);
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback(s.autoDelivery ? '⛔ Nonaktifkan' : '✅ Aktifkan', 'adv:tg:autoDelivery')],
    [Markup.button.callback('⏱ Delay (detik)', 'adv:set:autoDeliveryDelaySec')],
    [Markup.button.callback('📝 Edit Template', 'adv:set:autoDeliveryTemplate')],
    [back('a:set')],
  ]);
  return safeEdit(ctx, text, kb);
}

// ===== NOTIFIKASI =====
const NOTIF_FIELDS = [
  ['notifNewUser', 'User Baru'],
  ['notifNewOrder', 'Order Baru'],
  ['notifPayment', 'Pembayaran'],
  ['notifStockOut', 'Stock Habis'],
  ['notifBroadcast', 'Broadcast'],
  ['notifError', 'Error'],
  ['notifAdminLogin', 'Login Admin'],
];
async function showNotif(ctx) {
  const s = await Settings.get();
  const text = box('🔔 NOTIFIKASI', NOTIF_FIELDS.map(([f, l]) => `${onOff(s[f])} ${l}`));
  const rows = NOTIF_FIELDS.map(([f, l]) => [Markup.button.callback(`${onOff(s[f])} ${l}`, `adv:tg:${f}`)]);
  rows.push([back('a:set')]);
  return safeEdit(ctx, text, Markup.inlineKeyboard(rows));
}

// ===== TAMPILAN BOT =====
async function showUI(ctx) {
  const s = await Settings.get();
  const text = box('🎨 TAMPILAN BOT', [
    `Header     : ${s.uiHeader || '-'}`,
    `Footer     : ${s.uiFooter || '-'}`,
    `Separator  : <code>${s.uiSeparator}</code>`,
    `Emoji      : ${s.uiEmoji}`,
    `Layout     : <b>${s.uiLayout}</b>`,
    `Banner Cap : ${s.homeBannerCaption || '-'}`,
  ]);
  const F = (l, f) => Markup.button.callback(l, `adv:set:${f}`);
  const kb = Markup.inlineKeyboard([
    [F('📝 Header', 'uiHeader'), F('📜 Footer', 'uiFooter')],
    [F('➖ Separator', 'uiSeparator'), F('😀 Emoji', 'uiEmoji')],
    [F('🖼 Banner Caption', 'homeBannerCaption')],
    [Markup.button.callback(`Layout: ${s.uiLayout}`, 'adv:ui:layout')],
    [back('a:set')],
  ]);
  return safeEdit(ctx, text, kb);
}

// ===== MAINTENANCE =====
async function showMaint(ctx) {
  const s = await Settings.get();
  const text = box('🛠 MAINTENANCE MODE', [
    `Status        : ${onOff(s.maintenanceMode)}`,
    `Allow Admin   : ${onOff(s.maintenanceAllowAdmin)}`,
    `Banner        : ${s.maintenanceBannerFileId ? '✅ Ada' : '❌ Belum'}`,
    '', '<b>Pesan:</b>', `<i>${(s.tplMaintenance||'').slice(0,200)}</i>`,
    s.maintenanceBannerCaption ? `\n<b>Caption Banner:</b>\n<i>${s.maintenanceBannerCaption}</i>` : '',
    '', '<i>Saat ON, semua user non-admin akan diblokir & melihat halaman maintenance.</i>',
  ]);
  const kb = Markup.inlineKeyboard([
    s.maintenanceMode
      ? [Markup.button.callback('❌ Nonaktifkan Maintenance', 'adv:tg:maintenanceMode')]
      : [Markup.button.callback('✅ Aktifkan Maintenance', 'adv:tg:maintenanceMode')],
    [Markup.button.callback(`👤 Allow Admin ${onOff(s.maintenanceAllowAdmin)}`, 'adv:tg:maintenanceAllowAdmin')],
    [Markup.button.callback('📝 Edit Pesan', 'adv:set:tplMaintenance')],
    [Markup.button.callback('🖼 Edit Banner', 'adv:maint:banner'),
     Markup.button.callback('📝 Edit Caption Banner', 'adv:set:maintenanceBannerCaption')],
    s.maintenanceBannerFileId ? [Markup.button.callback('🗑 Hapus Banner', 'adv:maint:rmbanner')] : [],
    [Markup.button.callback('👁 Preview', 'adv:maint:preview')],
    [back('a:set')],
  ].filter(r => r.length));
  return safeEdit(ctx, text, kb);
}

// ===== BACKUP & RESTORE =====
async function showBackup(ctx) {
  const text = box('💾 BACKUP & RESTORE', [
    'Backup semua data ke file JSON, atau export per koleksi.',
    '',
    '<i>Restore: kirim file backup .json setelah klik tombol Restore.</i>',
  ]);
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('💾 Backup Database (Full)', 'adv:bk:full')],
    [Markup.button.callback('📤 Export Produk', 'adv:bk:products'),
     Markup.button.callback('📤 Export Stock', 'adv:bk:stocks')],
    [Markup.button.callback('📤 Export User', 'adv:bk:users')],
    [Markup.button.callback('♻️ Restore Database', 'adv:bk:restore')],
    [back('a:set')],
  ]);
  return safeEdit(ctx, text, kb);
}

async function doBackup(ctx, kind) {
  try {
    let data, filename;
    if (kind === 'full') {
      data = {
        settings: await Settings.get(),
        products: await Product.find(),
        stocks: await Stock.find(),
        users: await User.find(),
        paymentMethods: await PaymentMethod.find(),
        exportedAt: new Date().toISOString(),
      };
      filename = `backup-full-${Date.now()}.json`;
    } else if (kind === 'products') { data = await Product.find(); filename = `products-${Date.now()}.json`; }
    else if (kind === 'stocks')   { data = await Stock.find();   filename = `stocks-${Date.now()}.json`;   }
    else if (kind === 'users')    { data = await User.find();    filename = `users-${Date.now()}.json`;    }
    const buf = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
    await ctx.replyWithDocument({ source: buf, filename });
    await audit(ctx.from.id, `backup.${kind}`, filename);
    try { await ctx.answerCbQuery('Backup terkirim ✅'); } catch {}
  } catch (e) {
    log.error('backup', e);
    try { await ctx.answerCbQuery('Gagal: '+e.message); } catch {}
  }
}

async function startRestore(ctx) {
  ctx.state.user.state = { admin: 'adv_restore' };
  await ctx.state.user.save();
  return safeEdit(ctx, box('♻️ RESTORE', [
    'Kirim file <b>.json</b> hasil backup-full.',
    '<i>⚠️ Data lama akan ditimpa.</i>',
  ]), Markup.inlineKeyboard([[back('adv:backup')]]));
}

// ===== ACTION HANDLER =====
async function handleAction(ctx, parts) {
  // parts: ['adv', sub, action?, arg?]
  const sub = parts[1];
  const u = ctx.state.user;

  // Routers per sub
  if (sub === 'join') {
    const act = parts[2];
    if (!act) return showJoin(ctx);
    if (act === 'toggle') {
      const s = await Settings.get(); s.joinChannelRequired = !s.joinChannelRequired; await s.save();
      return showJoin(ctx);
    }
    if (act === 'add')     { u.state = { admin: 'adv_join_add' }; await u.save();
      return safeEdit(ctx, box('➕ TAMBAH CHANNEL', ['Kirim channel ID (contoh: <code>@nama</code> atau <code>-1001234</code>):']),
        Markup.inlineKeyboard([[back('adv:join')]])); }
    if (act === 'primary') { u.state = { admin: 'adv_join_primary' }; await u.save();
      return safeEdit(ctx, box('🔄 GANTI CHANNEL PRIMARY', ['Kirim channel ID baru:']),
        Markup.inlineKeyboard([[back('adv:join')]])); }
    if (act === 'msg')     { u.state = { admin: 'adv_set', field: 'joinMessage' }; await u.save();
      return safeEdit(ctx, box('📝 Edit Pesan Join', ['Kirim pesan baru:']),
        Markup.inlineKeyboard([[back('adv:join')]])); }
    if (act === 'del') {
      const idx = parseInt(parts[3], 10);
      const s = await Settings.get();
      s.joinChannels.splice(idx, 1); s.markModified('joinChannels'); await s.save();
      return showJoin(ctx);
    }
  }

  if (sub === 'resi') {
    const act = parts[2];
    if (!act) return showResi(ctx);
    if (act === 'toggle') { const s = await Settings.get(); s.resiAutoForward = !s.resiAutoForward; await s.save(); return showResi(ctx); }
    if (act === 'ch')  { u.state = { admin: 'adv_set', field: 'resiChannelId' }; await u.save();
      return safeEdit(ctx, box('🔄 Channel Resi', ['Kirim channel ID baru:']), Markup.inlineKeyboard([[back('adv:resi')]])); }
    if (act === 'cap') { u.state = { admin: 'adv_set', field: 'resiCaption' }; await u.save();
      return safeEdit(ctx, box('📝 Caption Resi', ['Kirim caption baru:']), Markup.inlineKeyboard([[back('adv:resi')]])); }
  }

  if (sub === 'cancel') {
    const act = parts[2];
    if (!act) return showCancel(ctx);
    if (act === 'set') {
      const m = parseInt(parts[3], 10);
      const s = await Settings.get(); s.invoiceExpiryMinutes = m; await s.save();
      await audit(ctx.from.id, 'settings.update', 'invoiceExpiryMinutes', { value: m });
      return showCancel(ctx);
    }
    if (act === 'custom') {
      u.state = { admin: 'adv_set', field: 'invoiceExpiryMinutes', isNum: true }; await u.save();
      return safeEdit(ctx, box('✏️ Custom Expiry', ['Kirim menit (angka):']), Markup.inlineKeyboard([[back('adv:cancel')]]));
    }
  }

  if (sub === 'store') return showStore(ctx);
  if (sub === 'bot')   return showBotProfile(ctx);
  if (sub === 'tpl')   return showTpl(ctx);
  if (sub === 'prod') {
    const act = parts[2];
    if (!act) return showProd(ctx);
    if (act === 'layout') {
      const s = await Settings.get(); s.productLayout = s.productLayout === 'list' ? 'grid' : 'list'; await s.save();
      return showProd(ctx);
    }
  }
  if (sub === 'deliv') return showDeliv(ctx);
  if (sub === 'notif') return showNotif(ctx);
  if (sub === 'ui') {
    const act = parts[2];
    if (!act) return showUI(ctx);
    if (act === 'layout') {
      const s = await Settings.get(); s.uiLayout = s.uiLayout === 'compact' ? 'spacious' : 'compact'; await s.save();
      return showUI(ctx);
    }
  }
  if (sub === 'maint') {
    const act = parts[2];
    if (!act) return showMaint(ctx);
    if (act === 'banner') {
      u.state = { admin: 'adv_maint_banner' }; await u.save();
      return safeEdit(ctx, box('🖼 Banner Maintenance', ['Kirim foto banner maintenance:']),
        Markup.inlineKeyboard([[back('adv:maint')]]));
    }
    if (act === 'rmbanner') {
      const s = await Settings.get();
      s.maintenanceBannerFileId = ''; await s.save();
      return showMaint(ctx);
    }
    if (act === 'preview') {
      const s = await Settings.get();
      const text = (s.tplMaintenance && s.tplMaintenance.trim()) ? s.tplMaintenance : require('../middleware/maintenance').DEFAULT_TEXT;
      try {
        if (s.maintenanceBannerFileId) {
          await ctx.replyWithPhoto(s.maintenanceBannerFileId, { caption: s.maintenanceBannerCaption || text, parse_mode: 'HTML' });
        } else {
          await ctx.reply(text, { parse_mode: 'HTML' });
        }
      } catch {}
      return showMaint(ctx);
    }
  }
  if (sub === 'mbanner') return showMenuBanners(ctx);
  if (sub === 'mb') {
    const key = parts[2];
    const act = parts[3];
    if (!act) return showMenuBannerDetail(ctx, key);
    if (act === 'upload') {
      u.state = { admin: 'adv_mb_upload', mbkey: key }; await u.save();
      return safeEdit(ctx, box('🖼 Upload Banner', [`Kirim foto banner untuk menu <b>${key}</b>:`]),
        Markup.inlineKeyboard([[back(`adv:mb:${key}`)]]));
    }
    if (act === 'caption') {
      u.state = { admin: 'adv_mb_caption', mbkey: key }; await u.save();
      return safeEdit(ctx, box('📝 Edit Caption', [`Kirim caption baru untuk menu <b>${key}</b>:`]),
        Markup.inlineKeyboard([[back(`adv:mb:${key}`)]]));
    }
    if (act === 'remove') {
      const s = await Settings.get();
      if (s.menuBanners && s.menuBanners.delete) s.menuBanners.delete(key); else if (s.menuBanners) delete s.menuBanners[key];
      s.markModified('menuBanners'); await s.save();
      return showMenuBannerDetail(ctx, key);
    }
  }
  if (sub === 'backup') return showBackup(ctx);
  if (sub === 'bk') {
    const kind = parts[2];
    if (kind === 'restore') return startRestore(ctx);
    return doBackup(ctx, kind);
  }

  // Generic toggle: adv:tg:<field>
  if (sub === 'tg') {
    const field = parts[2];
    const s = await Settings.get();
    s[field] = !s[field]; await s.save();
    await audit(ctx.from.id, 'settings.toggle', field, { value: s[field] });
    // route back to relevant page
    return routeBackForField(ctx, field);
  }

  // Generic set: adv:set:<field>
  if (sub === 'set') {
    const field = parts[2];
    const NUM = ['invoiceExpiryMinutes','productMinQty','productMaxQty','productPageSize','autoDeliveryDelaySec'];
    u.state = { admin: 'adv_set', field, isNum: NUM.includes(field) }; await u.save();
    return safeEdit(ctx, box('✏️ EDIT', [`Kirim nilai baru untuk <code>${field}</code>:`]),
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', backRouteForField(field))]]));
  }
}

function backRouteForField(field) {
  const map = {
    storeName:'adv:store', storeSubtitle:'adv:store', storeDescription:'adv:store',
    contactInfo:'adv:store', adminUsername:'adv:store', operationalHours:'adv:store',
    channelLink:'adv:store', groupLink:'adv:store', footer:'adv:store',
    botName:'adv:bot', botEmoji:'adv:bot', botHeader:'adv:bot', botFooter:'adv:bot',
    botCaptionHome:'adv:bot', welcomeMessage:'adv:bot',
    productMinQty:'adv:prod', productMaxQty:'adv:prod', productPageSize:'adv:prod',
    autoDeliveryDelaySec:'adv:deliv', autoDeliveryTemplate:'adv:deliv',
    uiHeader:'adv:ui', uiFooter:'adv:ui', uiSeparator:'adv:ui', uiEmoji:'adv:ui', homeBannerCaption:'adv:ui',
    tplMaintenance:'adv:maint',
    maintenanceBannerCaption:'adv:maint',
    resiChannelId:'adv:resi', resiCaption:'adv:resi',
    joinMessage:'adv:join',
    invoiceExpiryMinutes:'adv:cancel',
  };
  if (field && field.startsWith('tpl')) return 'adv:tpl';
  return map[field] || 'a:set';
}

function routeBackForField(ctx, field) {
  const target = backRouteForField(field);
  // Re-dispatch
  return handleAction(ctx, target.split(':'));
}

// ===== TEXT INPUT (returns true if handled) =====
async function handleText(ctx) {
  const u = ctx.state.user;
  const st = u.state || {};
  if (!st.admin) return false;
  const text = (ctx.message.text || '').trim();

  if (st.admin === 'adv_set') {
    await deleteUserMessage(ctx);
    const s = await Settings.get();
    const val = st.isNum ? parseInt(text.replace(/\D/g,''), 10) : text;
    if (st.isNum && (!val || val < 0)) {
      await safeEdit(ctx, err('Invalid', 'Nilai harus angka positif.'), Markup.inlineKeyboard([[back(backRouteForField(st.field))]]));
      u.state = {}; await u.save(); return true;
    }
    s[st.field] = val; await s.save();
    await audit(ctx.from.id, 'settings.update', st.field, { value: val });
    u.state = {}; await u.save();
    await handleAction(ctx, backRouteForField(st.field).split(':'));
    return true;
  }

  if (st.admin === 'adv_join_add') {
    await deleteUserMessage(ctx);
    const s = await Settings.get();
    s.joinChannels.push({ channelId: text, title: text, link: text.startsWith('@') ? `https://t.me/${text.slice(1)}` : '' });
    s.markModified('joinChannels'); await s.save();
    u.state = {}; await u.save();
    await showJoin(ctx); return true;
  }
  if (st.admin === 'adv_join_primary') {
    await deleteUserMessage(ctx);
    const s = await Settings.get();
    s.channelId = text; s.channelTitle = text; await s.save();
    u.state = {}; await u.save();
    await showJoin(ctx); return true;
  }
  if (st.admin === 'adv_mb_caption') {
    await deleteUserMessage(ctx);
    const s = await Settings.get();
    const cur = (s.menuBanners && s.menuBanners.get) ? (s.menuBanners.get(st.mbkey) || {}) : ((s.menuBanners||{})[st.mbkey] || {});
    const next = { ...cur, caption: text };
    if (s.menuBanners && s.menuBanners.set) s.menuBanners.set(st.mbkey, next);
    else { s.menuBanners = s.menuBanners || {}; s.menuBanners[st.mbkey] = next; }
    s.markModified('menuBanners'); await s.save();
    u.state = {}; await u.save();
    await showMenuBannerDetail(ctx, st.mbkey); return true;
  }
  return false;
}

async function handlePhoto(ctx) {
  const u = ctx.state.user;
  const st = u.state || {};
  const fileId = ctx.message.photo[ctx.message.photo.length-1].file_id;

  if (st.admin === 'adv_maint_banner') {
    await deleteUserMessage(ctx);
    const s = await Settings.get();
    s.maintenanceBannerFileId = fileId; await s.save();
    u.state = {}; await u.save();
    await showMaint(ctx);
    return true;
  }

  if (st.admin !== 'adv_mb_upload') return false;
  await deleteUserMessage(ctx);
  const s = await Settings.get();
  const cur = (s.menuBanners && s.menuBanners.get) ? (s.menuBanners.get(st.mbkey) || {}) : ((s.menuBanners||{})[st.mbkey] || {});
  const next = { ...cur, fileId };
  if (s.menuBanners && s.menuBanners.set) s.menuBanners.set(st.mbkey, next);
  else { s.menuBanners = s.menuBanners || {}; s.menuBanners[st.mbkey] = next; }
  s.markModified('menuBanners'); await s.save();
  u.state = {}; await u.save();
  await showMenuBannerDetail(ctx, st.mbkey);
  return true;
}

async function handleDocument(ctx) {
  const u = ctx.state.user;
  const st = u.state || {};
  if (st.admin !== 'adv_restore') return false;
  try {
    const link = await ctx.telegram.getFileLink(ctx.message.document.file_id);
    const axios = require('axios');
    const res = await axios.get(link.href, { responseType: 'text' });
    const data = JSON.parse(res.data);
    let restored = [];
    if (data.settings) {
      await Settings.deleteOne({ _id: 'global' });
      const { _id, __v, createdAt, updatedAt, ...rest } = data.settings;
      await Settings.create({ _id: 'global', ...rest });
      restored.push('settings');
    }
    if (Array.isArray(data.products)) { await Product.deleteMany({}); await Product.insertMany(data.products); restored.push(`products(${data.products.length})`); }
    if (Array.isArray(data.stocks))   { await Stock.deleteMany({});   await Stock.insertMany(data.stocks);     restored.push(`stocks(${data.stocks.length})`); }
    if (Array.isArray(data.users))    { await User.deleteMany({});    await User.insertMany(data.users);       restored.push(`users(${data.users.length})`); }
    if (Array.isArray(data.paymentMethods)) { await PaymentMethod.deleteMany({}); await PaymentMethod.insertMany(data.paymentMethods); restored.push(`payments(${data.paymentMethods.length})`); }
    u.state = {}; await u.save();
    await audit(ctx.from.id, 'restore', 'full', { restored });
    await sendMain(ctx, ok('Restore Selesai', restored.join(', ') || '(nothing)'), Markup.inlineKeyboard([[back('adv:backup')]]));
  } catch (e) {
    log.error('restore', e);
    u.state = {}; await u.save();
    await sendMain(ctx, err('Restore Gagal', e.message), Markup.inlineKeyboard([[back('adv:backup')]]));
  }
  return true;
}

module.exports = { showHub, handleAction, handleText, handlePhoto, handleDocument };
