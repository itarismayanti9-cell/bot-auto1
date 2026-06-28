const { Markup } = require('telegraf');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Settings = require('../models/Settings');
const PaymentMethod = require('../models/PaymentMethod');
const AuditLog = require('../models/AuditLog');
const Broadcast = require('../models/Broadcast');
const { box, rupiah, SEP, ok, err } = require('../utils/ui');
const { safeEdit, sendMain, deleteUserMessage } = require('../utils/safeEdit');
const orderSvc = require('../services/orderService');
const stockSvc = require('../services/stockService');
const log = require('../utils/logger');

const back = (cb='admin') => Markup.button.callback('⬅️ Kembali', cb);

// ===== Audit =====
async function audit(actorId, action, target, meta = {}) {
  await AuditLog.create({ actorId, actorRole: 'admin', action, target, meta }).catch(()=>{});
}

// ===== ADMIN PANEL HOME =====
async function showPanel(ctx) {
  const text = `🛠 <b>ADMIN PANEL</b>\n<i>Kelola toko digital Anda</i>`;
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('📊 Dashboard', 'a:dash')],
    [Markup.button.callback('📦 Kelola Produk', 'a:prod'), Markup.button.callback('📥 Kelola Stock', 'a:stock')],
    [Markup.button.callback('🖼 Banner', 'a:banner'), Markup.button.callback('💰 Harga & Produk', 'a:prod')],
    [Markup.button.callback('💳 Pembayaran', 'a:pay'), Markup.button.callback('📢 Broadcast', 'a:bc')],
    [Markup.button.callback('👥 User Management', 'a:user'), Markup.button.callback('⚙️ Pengaturan Lanjutan', 'a:set')],
    [Markup.button.callback('📋 Audit Log', 'a:log'), Markup.button.callback('🏠 Beranda User', 'home')],
    [Markup.button.callback('❌ Tutup', 'a:close')],
  ]);
  return safeEdit(ctx, text, kb);
}

// ===== DASHBOARD =====
async function showDashboard(ctx) {
  const [users, products, orders, revenueAgg, stockCount] = await Promise.all([
    User.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.aggregate([{ $match: { status: 'delivered' } }, { $group: { _id: null, t: { $sum: '$total' } } }]),
    Stock.countDocuments({ status: 'available' }),
  ]);
  const revenue = (revenueAgg[0] && revenueAgg[0].t) || 0;
  const lines = [
    `👥 Total User      : <b>${users}</b>`,
    `📦 Total Produk    : <b>${products}</b>`,
    `🧾 Total Order     : <b>${orders}</b>`,
    `💰 Total Revenue   : <b>${rupiah(revenue)}</b>`,
    `📊 Total Stock     : <b>${stockCount}</b>`,
  ];
  return safeEdit(ctx, box('📊 DASHBOARD', lines), Markup.inlineKeyboard([[back()]]));
}

// ===== PRODUCT MANAGEMENT =====
async function showProductList(ctx, page = 0) {
  const PER = 8;
  const total = await Product.countDocuments();
  const items = await Product.find().sort({ createdAt: -1 }).skip(page*PER).limit(PER);
  const rows = items.map(p => [Markup.button.callback(`${p.active ? '🟢' : '🔴'} ${p.name} — ${rupiah(p.price)}`, `ap:${p._id}`)]);
  rows.push([Markup.button.callback('➕ Tambah Produk', 'ap:new')]);
  const nav = [];
  if (page > 0) nav.push(Markup.button.callback('⬅️', `aps:${page-1}`));
  if ((page+1)*PER < total) nav.push(Markup.button.callback('➡️', `aps:${page+1}`));
  if (nav.length) rows.push(nav);
  rows.push([back()]);
  return safeEdit(ctx, box('📦 KELOLA PRODUK', [`Total produk: <b>${total}</b>`]), Markup.inlineKeyboard(rows));
}

async function showProductAdmin(ctx, id) {
  const p = await Product.findById(id);
  if (!p) return showProductList(ctx);
  const stock = await stockSvc.countAvailable(p._id);
  const text = [
    SEP, `📦 <b>${p.name}</b>`, SEP, '',
    `💰 Harga  : <b>${rupiah(p.price)}</b>`,
    `📊 Stock  : <b>${stock}</b>`,
    `📈 Sold   : <b>${p.sold}</b>`,
    `⭐ Status : ${p.active ? '🟢 Aktif' : '🔴 Nonaktif'}`,
    '', p.description || '<i>(no desc)</i>', SEP
  ].join('\n');
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Nama', `ape:${id}:name`), Markup.button.callback('💰 Harga', `ape:${id}:price`)],
    [Markup.button.callback('📝 Deskripsi', `ape:${id}:desc`), Markup.button.callback('🖼 Banner', `ape:${id}:banner`)],
    [Markup.button.callback(p.active ? '⛔ Nonaktifkan' : '✅ Aktifkan', `apt:${id}`)],
    [Markup.button.callback('📥 Kelola Stock', `as:${id}`)],
    [Markup.button.callback('🗑 Hapus Produk', `apd:${id}`)],
    [Markup.button.callback('⬅️ Kembali', 'a:prod')],
  ]);
  return safeEdit(ctx, text, kb);
}

async function newProductFlow(ctx) {
  ctx.state.user.state = { admin: 'newprod_name' };
  await ctx.state.user.save();
  return safeEdit(ctx, box('➕ TAMBAH PRODUK', ['Kirim <b>nama produk</b>:']), Markup.inlineKeyboard([[back('a:prod')]]));
}

async function editProductFlow(ctx, id, field) {
  const prompts = { name: 'nama produk baru', price: 'harga baru (angka)', desc: 'deskripsi baru', banner: 'foto banner baru' };
  ctx.state.user.state = { admin: `editprod_${field}`, pid: id };
  await ctx.state.user.save();
  return safeEdit(ctx, box('✏️ EDIT PRODUK', [`Kirim ${prompts[field]}:`]), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', `ap:${id}`)]]));
}

async function toggleProduct(ctx, id) {
  const p = await Product.findById(id);
  if (!p) return showProductList(ctx);
  p.active = !p.active; await p.save();
  await audit(ctx.from.id, 'product.toggle', String(p._id), { active: p.active });
  return showProductAdmin(ctx, id);
}

async function deleteProduct(ctx, id) {
  await Stock.deleteMany({ productId: id });
  await Product.deleteOne({ _id: id });
  await audit(ctx.from.id, 'product.delete', id);
  return showProductList(ctx);
}

// ===== STOCK MANAGEMENT =====
async function showStockMenu(ctx, page = 0) {
  const PER = 10;
  const items = await Product.find().sort({ createdAt: -1 }).skip(page*PER).limit(PER);
  const rows = [];
  for (const p of items) {
    const c = await stockSvc.countAvailable(p._id);
    rows.push([Markup.button.callback(`${p.name} • ${c}`, `as:${p._id}`)]);
  }
  rows.push([back()]);
  return safeEdit(ctx, box('📥 KELOLA STOCK', ['Pilih produk untuk mengelola stock:']), Markup.inlineKeyboard(rows));
}

async function showProductStock(ctx, productId) {
  const p = await Product.findById(productId);
  if (!p) return showStockMenu(ctx);
  const c = await stockSvc.countAvailable(p._id);
  const sold = await Stock.countDocuments({ productId, status: 'sold' });
  const reserved = await Stock.countDocuments({ productId, status: 'reserved' });
  const text = box(`📥 STOCK — ${p.name}`, [
    `✅ Tersedia : <b>${c}</b>`,
    `🔒 Reserved : <b>${reserved}</b>`,
    `📦 Terjual  : <b>${sold}</b>`,
  ]);
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Tambah Stock', `ast:${productId}:add`)],
    [Markup.button.callback('📥 Import TXT', `ast:${productId}:import`)],
    [Markup.button.callback('📤 Export TXT', `ast:${productId}:export`)],
    [Markup.button.callback('🗑 Kosongkan', `ast:${productId}:clear`)],
    [Markup.button.callback('⬅️ Kembali', `ap:${productId}`)],
  ]);
  return safeEdit(ctx, text, kb);
}

async function stockAction(ctx, productId, action) {
  if (action === 'add' || action === 'import') {
    ctx.state.user.state = { admin: 'stock_add', pid: productId, addedTotal: 0 };
    await ctx.state.user.save();
    return safeEdit(ctx, box('➕ TAMBAH STOCK', [
      'Kirim stock (multi-line) atau upload <b>.txt</b>.',
      '',
      'Setiap <b>akun</b> dipisah dengan baris delimiter:',
      '<code>====================</code>',
      '',
      'Contoh 2 akun:',
      '<code>email1\npassword1\nkey1\n====================\nemail2\npassword2\nkey2</code>',
      '',
      '<i>Tanpa delimiter = 1 akun. Mode ini tetap aktif sampai Anda menekan ✅ Selesai.</i>',
    ]), Markup.inlineKeyboard([
      [Markup.button.callback('❌ Batal', `as_cancel:${productId}`)],
    ]));
  }
  if (action === 'clear') {
    const n = await stockSvc.clearStock(productId);
    await audit(ctx.from.id, 'stock.clear', productId, { removed: n });
    return safeEdit(ctx, ok('Stock Dikosongkan', `Dihapus: <b>${n}</b> item`), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', `as:${productId}`)]]));
  }
  if (action === 'export') {
    const items = await Stock.find({ productId, status: 'available' }).sort({ createdAt: 1 });
    if (!items.length) return safeEdit(ctx, err('Export', 'Tidak ada stock tersedia.'), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', `as:${productId}`)]]));
    const content = stockSvc.serializeBlocks(items.map(i => i.content));
    const buf = Buffer.from(content, 'utf-8');
    await ctx.replyWithDocument({ source: buf, filename: `stock-${productId}.txt` });
    return showProductStock(ctx, productId);
  }
}

// ===== STOCK ADD: incremental status page (editMessage only) =====
async function showStockAddStatus(ctx, productId, lastAdded) {
  const total = await stockSvc.countAvailable(productId);
  const p = await Product.findById(productId);
  const u = ctx.state.user;
  const st = u.state || {};
  const lines = [
    lastAdded ? `✅ <b>${lastAdded}</b> akun berhasil ditambahkan.` : 'Kirim stock baru…',
    '',
    `📦 Produk: <b>${p ? p.name : '-'}</b>`,
    `📊 Stock saat ini: <b>${total}</b>`,
    `📥 Ditambahkan sesi ini: <b>${st.addedTotal || 0}</b>`,
    '',
    '<i>Silakan kirim stock lagi, atau tekan ✅ Selesai bila sudah cukup.</i>',
  ];
  const kb = (st.addedTotal || 0) > 0
    ? Markup.inlineKeyboard([
        [Markup.button.callback('✅ Selesai', `as_done:${productId}`)],
        [Markup.button.callback('❌ Batal', `as_cancel:${productId}`)],
      ])
    : Markup.inlineKeyboard([
        [Markup.button.callback('❌ Batal', `as_cancel:${productId}`)],
      ]);
  return safeEdit(ctx, box('➕ TAMBAH STOCK', lines), kb);
}

async function stockAddDone(ctx, productId) {
  const u = ctx.state.user;
  const added = (u.state && u.state.addedTotal) || 0;
  u.state = {}; await u.save();
  if (added > 0) {
    try { await notifyStockAvailable(ctx, productId); } catch (e) { log.error('notif stock', e); }
  }
  return showPanel(ctx);
}

async function stockAddCancel(ctx, productId) {
  ctx.state.user.state = {}; await ctx.state.user.save();
  return showProductStock(ctx, productId);
}

async function notifyStockAvailable(ctx, productId) {
  const { isAdmin } = require('../middleware/auth');
  const p = await Product.findById(productId);
  if (!p) return;
  const total = await stockSvc.countAvailable(productId);
  const LINE = '━━━━━━━━━━━━━━━━━━';
  const now = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const text = [
    LINE,
    '📢 <b>STOCK BARU TERSEDIA</b>',
    '',
    `📦 Produk\n<b>${p.name}</b>`,
    '',
    `📊 Total Stock Saat Ini\n<b>${total} Akun</b>`,
    '',
    `🕒 Update\n<b>${now}</b>`,
    '',
    '<i>Silakan lakukan pembelian melalui menu produk.</i>',
    LINE,
  ].join('\n');
  const users = await User.find({ banned: false }).select('telegramId');
  let sent = 0, failed = 0;
  for (const u of users) {
    if (isAdmin(u.telegramId)) continue; // exclude admins
    try { await ctx.telegram.sendMessage(u.telegramId, text, { parse_mode: 'HTML' }); sent++; }
    catch { failed++; }
    if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
  }
  await audit(ctx.from.id, 'stock.notify', String(p._id), { sent, failed, total });
}

// ===== BANNER =====
async function showBannerMenu(ctx) {
  const s = await Settings.get();
  const lines = [
    `Home banner: ${s.homeBannerFileId ? '✅ Ada' : '❌ Belum diatur'}`,
    s.homeBannerCaption ? `Caption: ${s.homeBannerCaption}` : '',
  ].filter(Boolean);
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🖼 Upload Banner Beranda', 'ab:home:upload')],
    [Markup.button.callback('📝 Edit Caption Beranda', 'ab:home:caption')],
    [Markup.button.callback('🗑 Hapus Banner Beranda', 'ab:home:remove')],
    [back()],
  ]);
  return safeEdit(ctx, box('🖼 KELOLA BANNER', lines), kb);
}

async function bannerAction(ctx, target, action) {
  if (action === 'upload') {
    ctx.state.user.state = { admin: 'banner_upload', target };
    await ctx.state.user.save();
    return safeEdit(ctx, box('🖼 Upload Banner', ['Kirim <b>foto banner</b>:']), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', 'a:banner')]]));
  }
  if (action === 'caption') {
    ctx.state.user.state = { admin: 'banner_caption', target };
    await ctx.state.user.save();
    return safeEdit(ctx, box('📝 Edit Caption', ['Kirim caption baru:']), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', 'a:banner')]]));
  }
  if (action === 'remove') {
    const s = await Settings.get();
    s.homeBannerFileId = ''; s.homeBannerCaption = ''; await s.save();
    return showBannerMenu(ctx);
  }
}

// ===== PAYMENT METHODS =====
async function showPaymentMenu(ctx) {
  const methods = await PaymentMethod.find().sort({ sortOrder: 1, createdAt: 1 });
  const rows = methods.map(m => [Markup.button.callback(`${m.active ? '🟢' : '🔴'} ${m.label || m.code}`, `apm:${m._id}`)]);
  rows.push([Markup.button.callback('➕ Tambah Metode', 'apm:new')]);
  rows.push([back()]);
  return safeEdit(ctx, box('💳 KELOLA PAYMENT', [methods.length ? `Total: ${methods.length}` : 'Belum ada metode pembayaran.']), Markup.inlineKeyboard(rows));
}

async function showPaymentMethodDetail(ctx, id) {
  const m = await PaymentMethod.findById(id);
  if (!m) return showPaymentMenu(ctx);
  if (m.code === 'autogopay') {
    return require('./adminAutogopay').showConfig(ctx);
  }
  const lines = [
    `Code     : <code>${m.code}</code>`,
    `Label    : ${m.label || '-'}`,
    `Tipe     : ${m.type}`,
    `Nama     : ${m.accountName || '-'}`,
    `No       : <code>${m.accountNumber || '-'}</code>`,
    `Aktif    : ${m.active ? '🟢' : '🔴'}`,
    m.qrisFileId ? 'QRIS     : ✅ ada' : '',
    m.instructions ? `\n${m.instructions}` : '',
  ].filter(Boolean);
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Label', `apme:${id}:label`), Markup.button.callback('👤 Nama', `apme:${id}:accountName`)],
    [Markup.button.callback('🔢 No.Rek', `apme:${id}:accountNumber`), Markup.button.callback('📝 Instruksi', `apme:${id}:instructions`)],
    [Markup.button.callback('🖼 QRIS Image', `apme:${id}:qris`)],
    [Markup.button.callback(m.active ? '⛔ Nonaktifkan' : '✅ Aktifkan', `apmt:${id}`)],
    [Markup.button.callback('🗑 Hapus', `apmd:${id}`)],
    [Markup.button.callback('⬅️ Kembali', 'a:pay')],
  ]);
  return safeEdit(ctx, box('💳 ' + (m.label || m.code), lines), kb);
}

// ===== PAYMENT TYPE GUIDES =====
const PAYMENT_GUIDES = {
  tripay:    { name: 'Tripay',     fields: ['API Key', 'Private Key', 'Merchant Code'] },
  midtrans:  { name: 'Midtrans',   fields: ['Server Key', 'Client Key', 'Merchant ID'] },
  xendit:    { name: 'Xendit',     fields: ['Secret API Key'] },
  duitku:    { name: 'Duitku',     fields: ['Merchant Code', 'API Key'] },
  binance:   { name: 'Binance Pay',fields: ['Merchant ID', 'API Key', 'Secret Key', 'Webhook Secret'] },
  qris:      { name: 'QRIS Manual',fields: ['Upload Gambar QRIS', 'Nama Pemilik', 'Keterangan'] },
  bank:      { name: 'Transfer Bank', fields: ['Nama Bank', 'Nomor Rekening', 'Nama Pemilik'] },
  dana:      { name: 'Dana',       fields: ['Nomor Dana', 'Nama Pemilik'] },
  ovo:       { name: 'OVO',        fields: ['Nomor OVO', 'Nama Pemilik'] },
  gopay:     { name: 'GoPay',      fields: ['Nomor GoPay', 'Nama Pemilik'] },
  shopeepay: { name: 'ShopeePay',  fields: ['Nomor ShopeePay', 'Nama Pemilik'] },
  autogopay: { name: '🟢 AutoGoPay', fields: ['Raw QRIS String', 'API Key'] },
};

async function newPaymentMethodFlow(ctx) {
  const codes = Object.keys(PAYMENT_GUIDES);
  const rows = [];
  for (let i = 0; i < codes.length; i += 2) {
    const row = [Markup.button.callback(PAYMENT_GUIDES[codes[i]].name, `apmn:${codes[i]}`)];
    if (codes[i+1]) row.push(Markup.button.callback(PAYMENT_GUIDES[codes[i+1]].name, `apmn:${codes[i+1]}`));
    rows.push(row);
  }
  rows.push([Markup.button.callback('🔧 Custom (code manual)', 'apmn:_custom')]);
  rows.push([Markup.button.callback('⬅️ Batal', 'a:pay')]);
  return safeEdit(ctx, box('➕ TAMBAH METODE PEMBAYARAN', [
    'Pilih jenis metode pembayaran:',
    '<i>Setiap jenis memiliki panduan field yang perlu diisi.</i>',
  ]), Markup.inlineKeyboard(rows));
}

async function paymentMethodGuide(ctx, code) {
  if (code === '_custom') {
    ctx.state.user.state = { admin: 'newpm_code' };
    await ctx.state.user.save();
    return safeEdit(ctx, box('➕ CUSTOM METODE', [
      'Kirim <b>code</b> metode (huruf kecil, contoh: <code>flip</code>, <code>jago</code>):',
    ]), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', 'a:pay')]]));
  }
  const g = PAYMENT_GUIDES[code];
  if (!g) return showPaymentMenu(ctx);
  // Check if already exists
  const exists = await PaymentMethod.findOne({ code });
  if (exists) return showPaymentMethodDetail(ctx, exists._id);

  const lines = [
    `<b>${g.name}</b>`,
    '',
    '<b>Field yang dibutuhkan:</b>',
    ...g.fields.map((f, i) => `${i+1}. ${f}`),
    '',
    '<i>Metode akan dibuat terlebih dahulu, lalu Anda bisa mengisi field-field di atas pada halaman detail.</i>',
  ];
  return safeEdit(ctx, box('💳 ' + g.name, lines), Markup.inlineKeyboard([
    [Markup.button.callback('✅ Buat & Lanjutkan', `apmc:${code}`)],
    [Markup.button.callback('⬅️ Batal', 'apm:new')],
  ]));
}

async function paymentMethodCreate(ctx, code) {
  const g = PAYMENT_GUIDES[code];
  if (!g) return showPaymentMenu(ctx);
  if (code === 'autogopay') {
    await require('./adminAutogopay').getOrCreate();
    return require('./adminAutogopay').showConfig(ctx);
  }
  let m = await PaymentMethod.findOne({ code });
  if (!m) {
    m = await PaymentMethod.create({
      code, label: g.name,
      type: ['tripay','midtrans','xendit','duitku','binance'].includes(code) ? 'gateway' : 'manual',
      active: false,
      instructions: `Field yang dibutuhkan:\n${g.fields.map((f,i)=>`${i+1}. ${f}`).join('\n')}`,
    });
  }
  return showPaymentMethodDetail(ctx, m._id);
}

async function editPaymentMethodFlow(ctx, id, field) {
  if (field === 'qris') {
    ctx.state.user.state = { admin: 'pm_qris', pmid: id };
    await ctx.state.user.save();
    return safeEdit(ctx, box('🖼 Upload QRIS', ['Kirim foto QRIS:']), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', `apm:${id}`)]]));
  }
  ctx.state.user.state = { admin: `pm_${field}`, pmid: id };
  await ctx.state.user.save();
  return safeEdit(ctx, box('✏️ Edit Metode', [`Kirim ${field} baru:`]), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', `apm:${id}`)]]));
}

async function togglePM(ctx, id) {
  const m = await PaymentMethod.findById(id); if (!m) return showPaymentMenu(ctx);
  m.active = !m.active; await m.save();
  return showPaymentMethodDetail(ctx, id);
}
async function deletePM(ctx, id) {
  await PaymentMethod.deleteOne({ _id: id });
  return showPaymentMenu(ctx);
}

// ===== PAYMENT VERIFICATION (approve/reject proof) =====
async function verifyPayment(ctx, pid, action) {
  const payment = await Payment.findById(pid);
  if (!payment) { try { await ctx.answerCbQuery('Tidak ditemukan'); } catch {} ; return; }
  if (payment.status === 'success') { try { await ctx.answerCbQuery('Sudah diverifikasi'); } catch {} ; return showPanel(ctx); }

  const order = await Order.findById(payment.orderId);
  if (!order) { try { await ctx.answerCbQuery('Order tidak ditemukan'); } catch {} ; return showPanel(ctx); }

  if (action === 'approve') {
    // 1) Payment & Order → SUCCESS
    payment.status = 'success'; payment.verifiedBy = ctx.from.id; payment.verifiedAt = new Date();
    await payment.save();
    order.status = 'paid'; order.paidAt = new Date(); await order.save();

    // 2) AUTO DELIVERY — always runs on approve
    let deliverErr = null;
    let contents = [];
    try {
      contents = await orderSvc.deliverOrder(order);
      // 3) Fallback FIFO if reservation was empty (legacy/edge case)
      if (!contents.length) {
        const need = order.quantity || 1;
        const fresh = await Stock.find({ productId: order.productId, status: 'available' })
          .sort({ createdAt: 1 }).limit(need);
        if (fresh.length < need) throw new Error(`Stock tidak cukup (butuh ${need}, ada ${fresh.length}).`);
        contents = fresh.map(f => f.content);
        await Stock.deleteMany({ _id: { $in: fresh.map(f => f._id) } });
        order.deliveredContent = contents;
        order.status = 'delivered';
        order.deliveredAt = new Date();
        await order.save();
        await Product.findByIdAndUpdate(order.productId, { $inc: { sold: order.quantity } });
      }
      // 4) Update user totals
      await User.updateOne({ telegramId: order.userId }, { $inc: { totalOrders: 1, totalSpent: order.total } });

      // 5) Send to user with clear separators
      const esc = (s) => String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const LINE = '━━━━━━━━━━━━━━━━━━━━━━';
      const blocks = contents.map((c, i) => `${LINE}\n📦 <b>AKUN ${i+1}</b>\n<code>${esc(c)}</code>`).join('\n') + `\n${LINE}`;
      const text = `✅ <b>Pembayaran Berhasil</b>\n🔖 <code>${order.invoice}</code>\n📦 ${order.productName} ×${order.quantity}\n💵 ${rupiah(order.total)}\n\n${blocks}\n\n<i>Terima kasih telah berbelanja!</i>`;
      await ctx.telegram.sendMessage(order.userId, text, { parse_mode: 'HTML' });
    } catch (e) {
      log.error('deliver fail', e);
      deliverErr = e.message || String(e);
      try { await ctx.telegram.sendMessage(order.userId,
        `⚠️ Pembayaran <code>${order.invoice}</code> sudah diterima. Auto-delivery gagal: <i>${deliverErr}</i>. Admin akan memproses manual.`,
        { parse_mode: 'HTML' }); } catch {}
    }

    await audit(ctx.from.id, 'payment.approve', String(payment._id), { invoice: order.invoice, delivered: contents.length, err: deliverErr });

    // 6) Update original proof message + answer callback
    try { await ctx.editMessageCaption(`✅ <b>SUCCESS</b> — ${order.invoice}\n📦 ${order.productName} ×${order.quantity} • dikirim: ${contents.length}${deliverErr?`\n⚠️ ${deliverErr}`:''}`, { parse_mode: 'HTML' }); } catch {}
    try { await ctx.answerCbQuery(deliverErr ? 'Approved (delivery err)' : 'Approved ✅ Dikirim'); } catch {}

    // 7) Return to Admin Panel via NEW message (proof msg has photo+caption, can't edit to plain panel)
    return sendMain(ctx, `🛠 <b>ADMIN PANEL</b>\n<i>Order ${order.invoice} → SUCCESS (${contents.length} akun terkirim)</i>`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📊 Dashboard', 'a:dash'), Markup.button.callback('📦 Kelola Produk', 'a:prod')],
        [Markup.button.callback('📥 Kelola Stock', 'a:stock'), Markup.button.callback('💳 Pembayaran', 'a:pay')],
        [Markup.button.callback('⚙️ Pengaturan Lanjutan', 'a:set'), Markup.button.callback('🛠 Admin Panel', 'admin')],
      ]));
  }

  // ===== REJECT =====
  payment.status = 'failed'; payment.verifiedBy = ctx.from.id; payment.verifiedAt = new Date();
  await payment.save();
  order.status = 'rejected'; await order.save();
  await stockSvc.releaseStock(order._id);
  try { await ctx.telegram.sendMessage(order.userId,
    `❌ <b>Pembayaran Ditolak</b>\n🔖 <code>${order.invoice}</code>\nStock telah dilepaskan. Silakan hubungi admin bila ada pertanyaan.`,
    { parse_mode: 'HTML' }); } catch {}
  await audit(ctx.from.id, 'payment.reject', String(payment._id), { invoice: order.invoice });
  try { await ctx.editMessageCaption(`❌ <b>REJECTED</b> — ${order.invoice}`, { parse_mode: 'HTML' }); } catch {}
  try { await ctx.answerCbQuery('Rejected ❌'); } catch {}
  return sendMain(ctx, `🛠 <b>ADMIN PANEL</b>\n<i>Order ${order.invoice} → REJECTED. Stock dikembalikan.</i>`,
    Markup.inlineKeyboard([
      [Markup.button.callback('📊 Dashboard', 'a:dash'), Markup.button.callback('📦 Kelola Produk', 'a:prod')],
      [Markup.button.callback('📥 Kelola Stock', 'a:stock'), Markup.button.callback('💳 Pembayaran', 'a:pay')],
      [Markup.button.callback('⚙️ Pengaturan Lanjutan', 'a:set'), Markup.button.callback('🛠 Admin Panel', 'admin')],
    ]));
}

// ===== BROADCAST =====
async function showBroadcastMenu(ctx) {
  return safeEdit(ctx, box('📢 BROADCAST', ['Pilih target broadcast:']),
    Markup.inlineKeyboard([
      [Markup.button.callback('📢 Semua User', 'abc:all')],
      [Markup.button.callback('🟢 User Aktif (7d)', 'abc:active')],
      [Markup.button.callback('📦 Pembeli Produk', 'abc:product')],
      [back()],
    ]));
}

async function broadcastStart(ctx, target) {
  if (target === 'product') {
    const items = await Product.find().limit(20);
    const rows = items.map(p => [Markup.button.callback(p.name, `abcp:${p._id}`)]);
    rows.push([back('a:bc')]);
    return safeEdit(ctx, box('📢 Pilih Produk', ['Pilih produk untuk broadcast pembelinya:']), Markup.inlineKeyboard(rows));
  }
  ctx.state.user.state = { admin: 'broadcast_text', target };
  await ctx.state.user.save();
  return safeEdit(ctx, box('📢 BROADCAST', ['Kirim isi pesan broadcast:']), Markup.inlineKeyboard([[back('a:bc')]]));
}

async function broadcastProduct(ctx, pid) {
  ctx.state.user.state = { admin: 'broadcast_text', target: 'product', pid };
  await ctx.state.user.save();
  return safeEdit(ctx, box('📢 BROADCAST', ['Kirim isi pesan broadcast:']), Markup.inlineKeyboard([[back('a:bc')]]));
}

async function executeBroadcast(ctx, text, target, pid) {
  let userIds = [];
  if (target === 'all') {
    userIds = (await User.find({ banned: false }).select('telegramId')).map(u => u.telegramId);
  } else if (target === 'active') {
    const since = new Date(Date.now() - 7*86400_000);
    userIds = (await User.find({ banned: false, lastSeen: { $gte: since } }).select('telegramId')).map(u => u.telegramId);
  } else if (target === 'product' && pid) {
    const orders = await Order.find({ productId: pid, status: 'delivered' }).distinct('userId');
    userIds = orders;
  }
  const bc = await Broadcast.create({ adminId: ctx.from.id, target, productId: pid, text, status: 'running' });
  let sent = 0, failed = 0;
  for (const id of userIds) {
    try { await ctx.telegram.sendMessage(id, text, { parse_mode: 'HTML' }); sent++; }
    catch { failed++; }
    if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
  }
  bc.sent = sent; bc.failed = failed; bc.status = 'done'; await bc.save();
  return sendMain(ctx, ok('Broadcast Selesai', `Terkirim: <b>${sent}</b>\nGagal: <b>${failed}</b>`), Markup.inlineKeyboard([[back()]]));
}

// ===== USER MANAGEMENT =====
async function showUserMenu(ctx) {
  const total = await User.countDocuments();
  const banned = await User.countDocuments({ banned: true });
  return safeEdit(ctx, box('👥 USER MANAGEMENT', [
    `Total : <b>${total}</b>`, `Banned: <b>${banned}</b>`,
  ]), Markup.inlineKeyboard([
    [Markup.button.callback('🔍 Cari User (by ID/username)', 'au:search')],
    [Markup.button.callback('📜 List User Terbaru', 'au:list')],
    [back()],
  ]));
}

async function userSearchFlow(ctx) {
  ctx.state.user.state = { admin: 'user_search' };
  await ctx.state.user.save();
  return safeEdit(ctx, box('🔍 CARI USER', ['Kirim Telegram ID atau username:']), Markup.inlineKeyboard([[back('a:user')]]));
}

async function listUsers(ctx) {
  const users = await User.find().sort({ createdAt: -1 }).limit(15);
  const lines = users.map(u => `${u.banned?'🚫':'✅'} <code>${u.telegramId}</code> @${u.username||'-'} • ${u.totalOrders} ord`);
  const rows = users.map(u => [Markup.button.callback(`${u.telegramId} @${u.username||'-'}`, `au:${u.telegramId}`)]);
  rows.push([back('a:user')]);
  return safeEdit(ctx, box('👥 USER TERBARU', lines.length ? lines : ['<i>Kosong</i>']), Markup.inlineKeyboard(rows));
}

async function showUserDetail(ctx, telegramId) {
  const u = await User.findOne({ telegramId: Number(telegramId) });
  if (!u) return safeEdit(ctx, err('User', 'Tidak ditemukan'), Markup.inlineKeyboard([[back('a:user')]]));
  const lines = [
    `ID       : <code>${u.telegramId}</code>`,
    `Username : @${u.username||'-'}`,
    `Nama     : ${[u.firstName,u.lastName].filter(Boolean).join(' ')}`,
    `Orders   : <b>${u.totalOrders}</b>`,
    `Spent    : <b>${rupiah(u.totalSpent)}</b>`,
    `Status   : ${u.banned?'🚫 Banned':'✅ Active'}`,
    `Joined   : ${u.createdAt.toLocaleString('id-ID')}`,
  ];
  return safeEdit(ctx, box('👤 DETAIL USER', lines), Markup.inlineKeyboard([
    [Markup.button.callback(u.banned ? '✅ Unban' : '🚫 Ban', `aub:${u.telegramId}`)],
    [back('a:user')],
  ]));
}

async function toggleBan(ctx, telegramId) {
  const u = await User.findOne({ telegramId: Number(telegramId) });
  if (!u) return showUserMenu(ctx);
  u.banned = !u.banned; await u.save();
  await audit(ctx.from.id, u.banned ? 'user.ban' : 'user.unban', String(u.telegramId));
  return showUserDetail(ctx, telegramId);
}

// ===== SETTINGS =====
async function showSettings(ctx) {
  const s = await Settings.get();
  const lines = [
    `🏪 Nama Toko          : ${s.storeName}`,
    `📝 Subtitle           : ${s.storeSubtitle}`,
    `👤 Admin Username     : ${s.adminUsername || '-'}`,
    `📢 Channel            : ${s.channelId || '-'} ${s.joinChannelRequired ? '(wajib)' : '(opsional)'}`,
    `🛒 Auto Delivery      : ${s.autoDelivery ? '🟢' : '🔴'}`,
    `💳 Manual Payment     : ${s.manualPaymentEnabled ? '🟢' : '🔴'}`,
    `🌐 Gateway Payment    : ${s.gatewayPaymentEnabled ? '🟢' : '🔴'}`,
    `📢 Broadcast          : ${s.broadcastEnabled ? '🟢' : '🔴'}`,
    `🔔 Notif Admin        : ${s.adminNotificationEnabled ? '🟢' : '🔴'}`,
    `🛠 Maintenance        : ${s.maintenanceMode ? '🟢' : '🔴'}`,
    `🔒 Store Closed       : ${s.storeClosed ? '🟢' : '🔴'}`,
    `⏳ Invoice Expiry     : ${s.invoiceExpiryMinutes} menit`,
  ];
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Nama Toko', 'asn:storeName'), Markup.button.callback('📝 Subtitle', 'asn:storeSubtitle')],
    [Markup.button.callback('👋 Pesan Welcome', 'asn:welcomeMessage'), Markup.button.callback('👤 Admin Username', 'asn:adminUsername')],
    [Markup.button.callback('📢 Channel ID', 'asn:channelId'), Markup.button.callback('🔗 Channel Link', 'asn:channelLink')],
    [Markup.button.callback('💬 Group Link', 'asn:groupLink'), Markup.button.callback('🕒 Jam Op.', 'asn:operationalHours')],
    [Markup.button.callback('📞 Kontak', 'asn:contactInfo'), Markup.button.callback('⏳ Expiry (mnt)', 'asn:invoiceExpiryMinutes')],
    [Markup.button.callback(`${s.joinChannelRequired?'🔴':'🟢'} Wajib Join Ch`, 'ast:joinChannelRequired'),
     Markup.button.callback(`${s.autoDelivery?'🔴':'🟢'} Auto Delivery`, 'ast:autoDelivery')],
    [Markup.button.callback(`${s.manualPaymentEnabled?'🔴':'🟢'} Manual Pay`, 'ast:manualPaymentEnabled'),
     Markup.button.callback(`${s.gatewayPaymentEnabled?'🔴':'🟢'} Gateway Pay`, 'ast:gatewayPaymentEnabled')],
    [Markup.button.callback(`${s.broadcastEnabled?'🔴':'🟢'} Broadcast`, 'ast:broadcastEnabled'),
     Markup.button.callback(`${s.adminNotificationEnabled?'🔴':'🟢'} Notif Admin`, 'ast:adminNotificationEnabled')],
    [Markup.button.callback(`${s.maintenanceMode?'🔴':'🟢'} Maintenance`, 'ast:maintenanceMode'),
     Markup.button.callback(`${s.storeClosed?'🔴':'🟢'} Toko Tutup`, 'ast:storeClosed')],
    [Markup.button.callback('📝 Template Pesan', 'a:tpl')],
    [Markup.button.callback('🗂 Menu User', 'a:menu')],
    [back()],
  ]);
  return safeEdit(ctx, box('⚙ PENGATURAN BOT', lines), kb);
}

async function toggleSetting(ctx, field) {
  const s = await Settings.get();
  s[field] = !s[field]; await s.save();
  return showSettings(ctx);
}

async function editSettingFlow(ctx, field) {
  ctx.state.user.state = { admin: 'setting_edit', field };
  await ctx.state.user.save();
  return safeEdit(ctx, box('✏️ EDIT', [`Kirim nilai baru untuk <code>${field}</code>:`]),
    Markup.inlineKeyboard([[back('a:set')]]));
}

// ===== TEMPLATES =====
async function showTemplates(ctx) {
  const s = await Settings.get();
  const fields = ['tplPaymentSuccess','tplPaymentFailed','tplOrderNew','tplStockOut','tplJoinChannel','tplMaintenance','tplStoreClosed'];
  const rows = fields.map(f => [Markup.button.callback(`✏️ ${f}`, `asn:${f}`)]);
  rows.push([back('a:set')]);
  return safeEdit(ctx, box('📝 TEMPLATE PESAN', fields.map(f => `<b>${f}</b>\n${s[f]||'-'}`)), Markup.inlineKeyboard(rows));
}

// ===== MENU USER CONFIG =====
async function showMenuConfig(ctx) {
  const s = await Settings.get();
  const rows = s.menus.sort((a,b)=>a.order-b.order).map(m => [
    Markup.button.callback(`${m.enabled?'🟢':'🔴'} ${m.label}`, `amk:${m.key}`),
  ]);
  rows.push([back('a:set')]);
  return safeEdit(ctx, box('🗂 MENU USER', ['Klik untuk toggle / edit:']), Markup.inlineKeyboard(rows));
}

async function menuActions(ctx, key) {
  const s = await Settings.get();
  const m = s.menus.find(x=>x.key===key);
  if (!m) return showMenuConfig(ctx);
  return safeEdit(ctx, box('🗂 MENU', [`Key: <code>${key}</code>`, `Label: ${m.label}`, `Enabled: ${m.enabled?'🟢':'🔴'}`]),
    Markup.inlineKeyboard([
      [Markup.button.callback(m.enabled?'⛔ Disable':'✅ Enable', `amt:${key}`)],
      [Markup.button.callback('✏️ Rename Label', `amr:${key}`)],
      [back('a:menu')],
    ]));
}
async function toggleMenu(ctx, key) {
  const s = await Settings.get();
  const m = s.menus.find(x=>x.key===key); if (!m) return showMenuConfig(ctx);
  m.enabled = !m.enabled; s.markModified('menus'); await s.save();
  return menuActions(ctx, key);
}
async function renameMenuFlow(ctx, key) {
  ctx.state.user.state = { admin: 'menu_rename', mkey: key };
  await ctx.state.user.save();
  return safeEdit(ctx, box('✏️ Rename Menu', ['Kirim label baru:']), Markup.inlineKeyboard([[back('a:menu')]]));
}

// ===== AUDIT LOG =====
async function showAuditLog(ctx) {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(20);
  const lines = logs.length ? logs.map(l =>
    `<code>${l.createdAt.toISOString().slice(0,16).replace('T',' ')}</code> • ${l.action} • <code>${l.target||'-'}</code>`
  ) : ['<i>Kosong</i>'];
  return safeEdit(ctx, box('📋 AUDIT LOG', lines), Markup.inlineKeyboard([[back()]]));
}

// ===== TEXT INPUT HANDLER (state machine) =====
async function handleText(ctx) {
  const u = ctx.state.user;
  const st = u.state || {};
  if (!st.admin) return false;

  const text = ctx.message.text || '';
  await deleteUserMessage(ctx);

  try {
    // New product flow
    if (st.admin === 'newprod_name') {
      u.state = { admin: 'newprod_price', name: text.trim() }; await u.save();
      await safeEdit(ctx, box('➕ TAMBAH PRODUK', [`Nama: <b>${text.trim()}</b>`, 'Kirim <b>harga</b> (angka):']), Markup.inlineKeyboard([[back('a:prod')]]));
      return true;
    }
    if (st.admin === 'newprod_price') {
      const price = parseInt(text.replace(/\D/g,''),10);
      if (!price || price < 1) { await safeEdit(ctx, err('Invalid', 'Harga tidak valid.'), Markup.inlineKeyboard([[back('a:prod')]])); return true; }
      u.state = { admin: 'newprod_desc', name: st.name, price }; await u.save();
      await safeEdit(ctx, box('➕ TAMBAH PRODUK', [`Nama: ${st.name}`, `Harga: ${rupiah(price)}`, 'Kirim <b>deskripsi</b> (atau ketik <code>-</code> untuk skip):']), Markup.inlineKeyboard([[back('a:prod')]]));
      return true;
    }
    if (st.admin === 'newprod_desc') {
      const desc = text.trim() === '-' ? '' : text.trim();
      const p = await Product.create({ name: st.name, price: st.price, description: desc });
      await audit(ctx.from.id, 'product.create', String(p._id));
      u.state = {}; await u.save();
      await showProductAdmin(ctx, p._id);
      return true;
    }

    // Edit product
    if (st.admin === 'editprod_name') {
      await Product.findByIdAndUpdate(st.pid, { name: text.trim() });
      u.state = {}; await u.save(); await showProductAdmin(ctx, st.pid); return true;
    }
    if (st.admin === 'editprod_price') {
      const price = parseInt(text.replace(/\D/g,''),10);
      if (!price) { await safeEdit(ctx, err('Invalid', 'Harga tidak valid.'), Markup.inlineKeyboard([[Markup.button.callback('⬅️', `ap:${st.pid}`)]])); return true; }
      await Product.findByIdAndUpdate(st.pid, { price });
      u.state = {}; await u.save(); await showProductAdmin(ctx, st.pid); return true;
    }
    if (st.admin === 'editprod_desc') {
      await Product.findByIdAndUpdate(st.pid, { description: text });
      u.state = {}; await u.save(); await showProductAdmin(ctx, st.pid); return true;
    }

    // Stock add (text mode) — parses by ACCOUNT BLOCK delimiter. Stays in mode.
    if (st.admin === 'stock_add') {
      const n = await stockSvc.addStock(st.pid, text);
      if (n > 0) {
        await audit(ctx.from.id, 'stock.add', st.pid, { added: n });
        u.state = { admin: 'stock_add', pid: st.pid, addedTotal: (st.addedTotal || 0) + n };
        await u.save();
      }
      await showStockAddStatus(ctx, st.pid, n);
      return true;
    }

    // Banner caption
    if (st.admin === 'banner_caption') {
      const s = await Settings.get();
      s.homeBannerCaption = text; await s.save();
      u.state = {}; await u.save(); await showBannerMenu(ctx); return true;
    }

    // Setting edit
    if (st.admin === 'setting_edit') {
      const s = await Settings.get();
      const val = ['invoiceExpiryMinutes'].includes(st.field) ? parseInt(text,10) : text;
      s[st.field] = val; await s.save();
      await audit(ctx.from.id, 'settings.update', st.field, { value: val });
      u.state = {}; await u.save(); await showSettings(ctx); return true;
    }

    // Menu rename
    if (st.admin === 'menu_rename') {
      const s = await Settings.get();
      const m = s.menus.find(x=>x.key===st.mkey);
      if (m) { m.label = text.trim(); s.markModified('menus'); await s.save(); }
      u.state = {}; await u.save(); await showMenuConfig(ctx); return true;
    }

    // New payment method
    if (st.admin === 'newpm_code') {
      const code = text.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
      if (!code) { await safeEdit(ctx, err('Invalid', 'Code tidak valid.'), Markup.inlineKeyboard([[back('a:pay')]])); return true; }
      const exists = await PaymentMethod.findOne({ code });
      if (exists) { u.state = {}; await u.save(); await showPaymentMethodDetail(ctx, exists._id); return true; }
      const m = await PaymentMethod.create({ code, label: code.toUpperCase(), type: 'manual', active: true });
      u.state = {}; await u.save(); await showPaymentMethodDetail(ctx, m._id); return true;
    }

    // Edit payment method fields
    if (st.admin && st.admin.startsWith('pm_') && st.admin !== 'pm_qris') {
      const field = st.admin.slice(3);
      await PaymentMethod.findByIdAndUpdate(st.pmid, { [field]: text });
      u.state = {}; await u.save(); await showPaymentMethodDetail(ctx, st.pmid); return true;
    }

    // Broadcast text
    if (st.admin === 'broadcast_text') {
      const target = st.target, pid = st.pid;
      u.state = {}; await u.save();
      await safeEdit(ctx, box('📢 BROADCAST', ['Memproses...']), Markup.inlineKeyboard([]));
      await executeBroadcast(ctx, text, target, pid);
      return true;
    }

    // User search
    if (st.admin === 'user_search') {
      u.state = {}; await u.save();
      const q = text.trim().replace(/^@/,'');
      let target = null;
      if (/^\d+$/.test(q)) target = await User.findOne({ telegramId: Number(q) });
      if (!target) target = await User.findOne({ username: q });
      if (!target) { await safeEdit(ctx, err('User', 'Tidak ditemukan'), Markup.inlineKeyboard([[back('a:user')]])); return true; }
      await showUserDetail(ctx, target.telegramId); return true;
    }

  } catch (e) {
    log.error('admin text', e);
    u.state = {}; await u.save();
    await sendMain(ctx, err('Error', e.message), Markup.inlineKeyboard([[back()]]));
  }
  return true;
}

async function handlePhoto(ctx) {
  const u = ctx.state.user;
  const st = u.state || {};
  const fileId = ctx.message.photo[ctx.message.photo.length-1].file_id;
  await deleteUserMessage(ctx);

  if (st.admin === 'banner_upload' && st.target === 'home') {
    const s = await Settings.get();
    s.homeBannerFileId = fileId; await s.save();
    u.state = {}; await u.save(); await showBannerMenu(ctx); return true;
  }
  if (st.admin === 'editprod_banner') {
    await Product.findByIdAndUpdate(st.pid, { bannerFileId: fileId });
    u.state = {}; await u.save(); await showProductAdmin(ctx, st.pid); return true;
  }
  if (st.admin === 'pm_qris') {
    await PaymentMethod.findByIdAndUpdate(st.pmid, { qrisFileId: fileId });
    u.state = {}; await u.save(); await showPaymentMethodDetail(ctx, st.pmid); return true;
  }
  return false;
}

async function handleDocument(ctx) {
  const u = ctx.state.user;
  const st = u.state || {};
  if (st.admin !== 'stock_add') return false;
  try {
    const link = await ctx.telegram.getFileLink(ctx.message.document.file_id);
    const axios = require('axios');
    const res = await axios.get(link.href, { responseType: 'text' });
    const n = await stockSvc.addStock(st.pid, String(res.data));
    if (n > 0) {
      await audit(ctx.from.id, 'stock.import', st.pid, { added: n });
      u.state = { admin: 'stock_add', pid: st.pid, addedTotal: (st.addedTotal || 0) + n };
      await u.save();
    }
    await deleteUserMessage(ctx);
    await showStockAddStatus(ctx, st.pid, n);
  } catch (e) {
    await sendMain(ctx, err('Import Gagal', e.message), Markup.inlineKeyboard([[back()]]));
  }
  return true;
}

module.exports = {
  showPanel, showDashboard,
  showProductList, showProductAdmin, newProductFlow, editProductFlow, toggleProduct, deleteProduct,
  showStockMenu, showProductStock, stockAction, stockAddDone, stockAddCancel,
  showBannerMenu, bannerAction,
  showPaymentMenu, showPaymentMethodDetail, newPaymentMethodFlow, paymentMethodGuide, paymentMethodCreate, editPaymentMethodFlow, togglePM, deletePM,
  verifyPayment,
  showBroadcastMenu, broadcastStart, broadcastProduct,
  showUserMenu, userSearchFlow, listUsers, showUserDetail, toggleBan,
  showSettings, toggleSetting, editSettingFlow,
  showTemplates, showMenuConfig, menuActions, toggleMenu, renameMenuFlow,
  showAuditLog,
  handleText, handlePhoto, handleDocument,
};
