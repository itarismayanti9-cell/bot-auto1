const { Markup } = require('telegraf');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Settings = require('../models/Settings');
const { box, rupiah, ok, err } = require('../utils/ui');
const { buildCatalog } = require('../utils/catalog');
const { safeEdit, sendMain, deleteUserMessage, editOrPhoto } = require('../utils/safeEdit');
const orderSvc = require('../services/orderService');
const stockSvc = require('../services/stockService');
const { notifyAdmins } = require('../services/notify');
const { showHome } = require('./home');

const backHomeBtn = Markup.button.callback('🏠 Beranda', 'home');

function getMenuBanner(s, key) {
  if (!s.menuBanners) return null;
  const v = (s.menuBanners.get) ? s.menuBanners.get(key) : s.menuBanners[key];
  return v && v.fileId ? v : null;
}

async function showProducts(ctx, page = 0) {
  const products = await Product.find({ active: true }).sort({ sortOrder: 1, createdAt: 1 });
  const items = await Promise.all(products.map(async p => ({
    _id: p._id, name: p.name, price: p.price,
    stock: await stockSvc.countAvailable(p._id),
  })));
  const { caption, rows } = buildCatalog(items, page, 10);
  const kb = Markup.inlineKeyboard([
    ...rows.map(r => r.map(b => Markup.button.callback(b.text, b.data))),
    [Markup.button.callback('⬅️ Kembali ke Menu', 'home')],
  ]);
  const s = await Settings.get();
  const banner = getMenuBanner(s, 'products');
  const text = banner && banner.caption ? `${banner.caption}\n\n${caption}` : caption;
  return editOrPhoto(ctx, banner && banner.fileId, text, kb);
}

async function showProductDetail(ctx, productId) {
  const p = await Product.findById(productId);
  if (!p || !p.active) return safeEdit(ctx, err('Tidak Tersedia', 'Produk tidak ditemukan.'), Markup.inlineKeyboard([[backHomeBtn]]));
  const stock = await stockSvc.countAvailable(p._id);
  const text = [
    `📦 <b>${p.name}</b>`,
    `💰 ${rupiah(p.price)}  ·  📊 Stock ${stock}  ·  ${stock>0?'⭐ Ready':'⛔ Habis'}`,
    ``,
    p.description || '<i>(tidak ada deskripsi)</i>',
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    stock > 0 ? [Markup.button.callback('🛒 Beli Sekarang', `b:${p._id}`)] : [],
    [Markup.button.callback('⬅️ Kembali', 'm:products'), backHomeBtn],
  ].filter(r => r.length));
  return safeEdit(ctx, text, kb);
}

async function showQtyPicker(ctx, productId) {
  const p = await Product.findById(productId);
  if (!p) return showProducts(ctx);
  const stock = await stockSvc.countAvailable(p._id);
  if (stock <= 0) return safeEdit(ctx, err('Stock Habis', 'Produk ini sedang tidak tersedia.'), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', `p:${productId}`)]]));

  const options = [1,2,3,4,5,10].filter(n => n <= stock);
  const rows = [];
  for (let i = 0; i < options.length; i += 3) {
    rows.push(options.slice(i, i+3).map(n => Markup.button.callback(`${n}x`, `q:${productId}:${n}`)));
  }
  rows.push([Markup.button.callback('✏️ Custom Jumlah', `qc:${productId}`)]);
  rows.push([Markup.button.callback('⬅️ Kembali', `p:${productId}`)]);

  const text = box(`🛒 PILIH JUMLAH — ${p.name}`, [
    `Harga: <b>${rupiah(p.price)}</b>`,
    `Stock tersedia: <b>${stock}</b>`,
  ]);
  return safeEdit(ctx, text, Markup.inlineKeyboard(rows));
}

async function showOrderConfirm(ctx, productId, qty) {
  const p = await Product.findById(productId);
  if (!p) return showProducts(ctx);
  const stock = await stockSvc.countAvailable(p._id);
  qty = Math.max(1, Math.min(qty, stock));
  const total = p.price * qty;

  ctx.state.user.state = { pendingProduct: String(p._id), pendingQty: qty };
  await ctx.state.user.save();

  const text = [
    `🧾 <b>KONFIRMASI PEMBELIAN</b>`,
    `📦 ${p.name}`,
    `🛒 ${qty}x  ·  💰 ${rupiah(p.price)}`,
    `💵 Total: <b>${rupiah(total)}</b>`,
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Bayar', `pay:${p._id}:${qty}`)],
    [Markup.button.callback('❌ Batal', `p:${p._id}`)],
  ]);
  return safeEdit(ctx, text, kb);
}

async function startPayment(ctx, productId, qty) {
  const userId = ctx.state.user.telegramId;
  const result = await orderSvc.createOrder({ userId, productId, quantity: qty });
  if (result.error) {
    return safeEdit(ctx, err('Gagal Membuat Order', result.error), Markup.inlineKeyboard([[backHomeBtn]]));
  }
  const order = result.order;
  await notifyAdmins(ctx.telegram, `🆕 <b>Order Baru</b>\n${order.invoice}\nUser: <code>${userId}</code>\nProduk: ${order.productName} x${order.quantity}\nTotal: ${rupiah(order.total)}`);
  return showInvoice(ctx, order.invoice);
}

async function showInvoice(ctx, invoice) {
  const order = await Order.findOne({ invoice });
  if (!order) return safeEdit(ctx, err('Invoice', 'Tidak ditemukan'), Markup.inlineKeyboard([[backHomeBtn]]));
  const PaymentMethod = require('../models/PaymentMethod');
  const methods = await PaymentMethod.find({ active: true }).sort({ sortOrder: 1 });

  const text = [
    `🧾 <b>INVOICE</b>  <code>${order.invoice}</code>`,
    `📦 ${order.productName} ×${order.quantity}`,
    `💵 <b>${rupiah(order.total)}</b>  ·  📊 ${order.status.toUpperCase()}`,
    `⏳ Exp: ${order.expiresAt ? new Date(order.expiresAt).toLocaleString('id-ID') : '-'}`,
    ``,
    `Pilih metode pembayaran:`,
  ].join('\n');

  const rows = methods.map(m => [Markup.button.callback(`${m.label || m.code}`, `pm:${order.invoice}:${m.code}`)]);
  if (!rows.length) rows.push([Markup.button.callback('⚠️ Belum ada metode pembayaran', 'noop')]);
  rows.push([Markup.button.callback('❌ Batalkan', `ocancel:${order.invoice}`)]);
  rows.push([backHomeBtn]);
  return safeEdit(ctx, text, Markup.inlineKeyboard(rows));
}

async function selectPaymentMethod(ctx, invoice, code) {
  const PaymentMethod = require('../models/PaymentMethod');
  const order = await Order.findOne({ invoice });
  const method = await PaymentMethod.findOne({ code, active: true });
  if (!order || !method) return safeEdit(ctx, err('Error', 'Metode tidak ditemukan.'), Markup.inlineKeyboard([[backHomeBtn]]));
  if (order.status !== 'pending') return safeEdit(ctx, err('Order', 'Order ini sudah tidak dapat dibayar.'), Markup.inlineKeyboard([[backHomeBtn]]));

  // ===== AutoGoPay (auto-verify gateway) =====
  if (method.code === 'autogopay') {
    return startAutogopay(ctx, order, method);
  }

  // Create/update Payment
  let payment = await Payment.findOne({ orderId: order._id, status: { $in: ['pending', 'verifying'] } });
  if (!payment) {
    payment = await Payment.create({
      orderId: order._id, invoice: order.invoice, userId: order.userId,
      method: method.code, amount: order.total, status: 'pending',
    });
  } else {
    payment.method = method.code;
    await payment.save();
  }
  order.paymentMethod = method.code;
  await order.save();

  ctx.state.user.state = { awaitingProof: String(payment._id) };
  await ctx.state.user.save();

  const text = [
    `💳 <b>${(method.label || method.code).toUpperCase()}</b>`,
    `🔖 <code>${order.invoice}</code>  ·  💵 <b>${rupiah(order.total)}</b>`,
    method.accountName ? `👤 ${method.accountName}` : '',
    method.accountNumber ? `🔢 <code>${method.accountNumber}</code>` : '',
    ``,
    method.instructions || 'Lakukan pembayaran, lalu kirim <b>foto bukti transfer</b> ke chat ini.',
    ``,
    `📸 <i>Kirim foto bukti di chat ini untuk konfirmasi.</i>`,
  ].filter(Boolean).join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Ganti Metode', `o:${order.invoice}`)],
    [Markup.button.callback('❌ Batalkan', `ocancel:${order.invoice}`)],
    [backHomeBtn],
  ]);

  if (method.qrisFileId) {
    const { sendPhoto } = require('../utils/safeEdit');
    return sendPhoto(ctx, method.qrisFileId, text, kb);
  }
  return safeEdit(ctx, text, kb);
}

async function receiveProof(ctx) {
  const u = ctx.state.user;
  const pid = u.state && u.state.awaitingProof;
  if (!pid) return;
  const payment = await Payment.findById(pid);
  if (!payment || payment.status !== 'pending') {
    u.state = {}; await u.save();
    return;
  }
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;
  payment.proofFileId = fileId;
  payment.status = 'verifying';
  await payment.save();

  u.state = {}; await u.save();
  await deleteUserMessage(ctx);

  const order = await Order.findById(payment.orderId);
  await notifyAdmins(ctx.telegram,
    `💰 <b>Bukti Pembayaran Masuk</b>\n🔖 ${order.invoice}\nUser: <code>${order.userId}</code>\nMethod: ${payment.method}\nTotal: ${rupiah(payment.amount)}\n\nGunakan /admin → Verifikasi Payment untuk approve/reject.`
  );
  // also forward proof photo
  for (const id of require('../config').ADMIN_IDS) {
    try {
      await ctx.telegram.sendPhoto(id, fileId, {
        caption: `🧾 Bukti — ${order.invoice}`,
        reply_markup: { inline_keyboard: [[
          { text: '✅ Approve', callback_data: `vpay:${payment._id}:approve` },
          { text: '❌ Reject',  callback_data: `vpay:${payment._id}:reject` },
        ]] }
      });
    } catch {}
  }

  const text = ok('Bukti Diterima', `Invoice: <code>${order.invoice}</code>\n\n⏳ Pembayaran sedang diverifikasi oleh admin.\nAnda akan diberi notifikasi setelah produk dikirim.`);
  return sendMain(ctx, text, Markup.inlineKeyboard([[Markup.button.callback('📜 Pesanan Saya', 'm:orders')], [backHomeBtn]]));
}

async function cancelOrder(ctx, invoice) {
  const order = await Order.findOne({ invoice, userId: ctx.state.user.telegramId });
  if (!order) return safeEdit(ctx, err('Order', 'Tidak ditemukan.'), Markup.inlineKeyboard([[backHomeBtn]]));
  const okx = await orderSvc.cancelOrder(order);
  if (!okx) return safeEdit(ctx, err('Order', 'Order tidak dapat dibatalkan.'), Markup.inlineKeyboard([[backHomeBtn]]));
  return safeEdit(ctx, ok('Order Dibatalkan', `Invoice ${order.invoice} telah dibatalkan.`),
    Markup.inlineKeyboard([[Markup.button.callback('📜 Pesanan Saya', 'm:orders')], [backHomeBtn]]));
}

async function listOrders(ctx, filter = 'active') {
  const u = ctx.state.user;
  const q = { userId: u.telegramId };
  if (filter === 'active') q.status = { $in: ['pending', 'paid'] };
  else if (filter === 'history') q.status = { $in: ['delivered', 'cancelled', 'expired', 'failed'] };

  const orders = await Order.find(q).sort({ createdAt: -1 }).limit(15);
  const lines = orders.length ? orders.map(o =>
    `🔖 <code>${o.invoice}</code>\n📦 ${o.productName} ×${o.quantity} • ${rupiah(o.total)}\n📊 ${o.status.toUpperCase()}`
  ) : ['<i>Belum ada pesanan.</i>'];

  const rows = orders.map(o => [Markup.button.callback(`🔍 ${o.invoice}`, `o:${o.invoice}`)]);
  rows.push([backHomeBtn]);

  const s = await Settings.get();
  const bkey = filter === 'history' ? 'history' : 'orders';
  const banner = getMenuBanner(s, bkey);
  return editOrPhoto(ctx, banner && banner.fileId, box(filter === 'history' ? '📋 RIWAYAT PESANAN' : '📜 PESANAN SAYA', lines), Markup.inlineKeyboard(rows));
}

async function listPayments(ctx) {
  const u = ctx.state.user;
  const payments = await Payment.find({ userId: u.telegramId }).sort({ createdAt: -1 }).limit(15);
  const lines = payments.length ? payments.map(p =>
    `🔖 <code>${p.invoice}</code>\n💳 ${p.method || '-'} • ${rupiah(p.amount)} • ${p.status.toUpperCase()}`
  ) : ['<i>Belum ada pembayaran.</i>'];
  const s = await Settings.get();
  const banner = getMenuBanner(s, 'payments');
  return editOrPhoto(ctx, banner && banner.fileId, box('💳 PEMBAYARAN SAYA', lines), Markup.inlineKeyboard([[backHomeBtn]]));
}

async function showOrderDetail(ctx, invoice) {
  const order = await Order.findOne({ invoice, userId: ctx.state.user.telegramId });
  if (!order) return safeEdit(ctx, err('Order', 'Tidak ditemukan.'), Markup.inlineKeyboard([[backHomeBtn]]));
  const lines = [
    `🔖 <code>${order.invoice}</code>`,
    `📦 ${order.productName} ×${order.quantity}`,
    `💵 Total: <b>${rupiah(order.total)}</b>`,
    `📊 Status: <b>${order.status.toUpperCase()}</b>`,
    `💳 Method: ${order.paymentMethod || '-'}`,
    order.deliveredAt ? `📤 Dikirim: ${new Date(order.deliveredAt).toLocaleString('id-ID')}` : '',
  ].filter(Boolean);
  if (order.status === 'delivered' && order.deliveredContent && order.deliveredContent.length) {
    const esc = (s) => String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const LINE = '━━━━━━━━━━━━━━━━━━━━━━';
    const blocks = order.deliveredContent.map((c, i) => `${LINE}\n📦 <b>AKUN ${i+1}</b>\n<code>${esc(c)}</code>`).join('\n') + `\n${LINE}`;
    lines.push('', blocks);
  }

  const rows = [];
  if (order.status === 'pending') {
    rows.push([Markup.button.callback('💳 Lanjut Bayar', `o:${order.invoice}`)]);
    rows.push([Markup.button.callback('❌ Batalkan', `ocancel:${order.invoice}`)]);
  }
  if (order.status === 'delivered') {
    rows.push([Markup.button.callback('📥 Kirim Ulang Produk', `oredeliver:${order.invoice}`)]);
  }
  rows.push([Markup.button.callback('⬅️ Kembali', 'm:orders'), backHomeBtn]);

  return safeEdit(ctx, box('🧾 DETAIL ORDER', lines), Markup.inlineKeyboard(rows));
}

async function redeliver(ctx, invoice) {
  const order = await Order.findOne({ invoice, userId: ctx.state.user.telegramId });
  if (!order || order.status !== 'delivered') return safeEdit(ctx, err('Order', 'Tidak dapat dikirim ulang.'), Markup.inlineKeyboard([[backHomeBtn]]));
  const esc = (s) => String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const LINE = '━━━━━━━━━━━━━━━━━━━━━━';
  const blocks = (order.deliveredContent||[]).map((c, i) => `${LINE}\n📦 <b>AKUN ${i+1}</b>\n<code>${esc(c)}</code>`).join('\n') + `\n${LINE}`;
  const text = `📥 <b>${order.invoice}</b>\n\n${blocks}`;
  await ctx.telegram.sendMessage(order.userId, text, { parse_mode: 'HTML' });
  return safeEdit(ctx, ok('Terkirim', 'Produk telah dikirim ulang ke chat ini.'), Markup.inlineKeyboard([[backHomeBtn]]));
}

async function showInfo(ctx) {
  const s = await Settings.get();
  const lines = [
    `🏪 <b>${s.storeName}</b>`,
    s.storeSubtitle ? `<i>${s.storeSubtitle}</i>` : '',
    '',
    s.adminUsername ? `👤 Admin    : @${s.adminUsername.replace(/^@/,'')}` : '',
    s.channelLink ? `📢 Channel  : ${s.channelLink}` : '',
    s.groupLink ? `💬 Grup     : ${s.groupLink}` : '',
    s.helpLink ? `❓ Bantuan  : ${s.helpLink}` : '',
    s.operationalHours ? `🕒 Jam Op.  : ${s.operationalHours}` : '',
    s.contactInfo ? `📞 Kontak   : ${s.contactInfo}` : '',
  ].filter(Boolean);
  const banner = getMenuBanner(s, 'info');
  return editOrPhoto(ctx, banner && banner.fileId, box('ℹ️ INFORMASI', lines), Markup.inlineKeyboard([[backHomeBtn]]));
}

async function showContact(ctx) {
  const s = await Settings.get();
  const lines = [
    'Hubungi admin untuk bantuan:',
    s.adminUsername ? `👤 @${s.adminUsername.replace(/^@/,'')}` : '',
    s.contactInfo || '',
  ].filter(Boolean);
  const banner = getMenuBanner(s, 'contact');
  return editOrPhoto(ctx, banner && banner.fileId, box('📞 HUBUNGI ADMIN', lines), Markup.inlineKeyboard([[backHomeBtn]]));
}

module.exports = {
  showProducts, showProductDetail, showQtyPicker, showOrderConfirm, startPayment,
  showInvoice, selectPaymentMethod, receiveProof, cancelOrder,
  listOrders, listPayments, showOrderDetail, redeliver, showInfo, showContact,
};

// ===== AutoGoPay flow =====
async function startAutogopay(ctx, order, method) {
  const autogopay = require('../services/autogopay');
  const autogopaySvc = require('../services/autogopayService');
  const { sendPhoto } = require('../utils/safeEdit');
  const QRCode = require('qrcode');

  const cfg = method.config || {};
  if (!cfg.apiKey || !cfg.rawQris) {
    return safeEdit(ctx, err('AutoGoPay Belum Siap', 'Admin belum melengkapi konfigurasi AutoGoPay. Pilih metode lain.'),
      Markup.inlineKeyboard([[Markup.button.callback('🔄 Pilih Metode Lain', `o:${order.invoice}`)], [backHomeBtn]]));
  }

  // Generate stable transaction_id (invoice based) so retries are idempotent
  const txId = order.invoice;

  // Find or create Payment
  let payment = await Payment.findOne({ orderId: order._id, method: 'autogopay' });
  if (!payment) {
    payment = await Payment.create({
      orderId: order._id, invoice: order.invoice, userId: order.userId,
      method: 'autogopay', amount: order.total, status: 'pending', externalRef: txId,
    });
  } else {
    payment.externalRef = txId; payment.amount = order.total;
    if (payment.status === 'failed') payment.status = 'pending';
    await payment.save();
  }
  order.paymentMethod = 'autogopay';
  order.paymentRef = txId;
  await order.save();

  // Call AutoGoPay generate (idempotent via stable transaction_id)
  const r = await autogopay.generateQris(cfg, {
    transactionId: txId,
    amount: order.total,
    description: `${order.productName} x${order.quantity}`,
  });
  if (!r.ok) {
    return safeEdit(ctx, err('AutoGoPay Gagal', `Tidak dapat membuat QRIS: <i>${r.error}</i>\n\nSilakan pilih metode pembayaran lain.`),
      Markup.inlineKeyboard([[Markup.button.callback('🔄 Pilih Metode Lain', `o:${order.invoice}`)], [backHomeBtn]]));
  }

  // Simpan transaction_id dari AutoGoPay
if (r.transactionId) {
    payment.externalRef = r.transactionId;
    await payment.save();

    order.paymentRef = r.transactionId;
    await order.save();

    console.log('AutoGoPay Transaction ID:', r.transactionId);
}

  // Render QRIS to PNG (use returned image URL if any, else generate from qrisString)
  let photoSource;
  if (r.qrImageUrl) {
    photoSource = r.qrImageUrl;
  } else if (r.qrisString) {
    const buf = await QRCode.toBuffer(r.qrisString, { errorCorrectionLevel: 'M', width: 512, margin: 1 });
    photoSource = { source: buf };
  } else {
    return safeEdit(ctx, err('AutoGoPay Gagal', 'Server tidak mengembalikan QRIS string.'),
      Markup.inlineKeyboard([[Markup.button.callback('🔄 Pilih Metode Lain', `o:${order.invoice}`)], [backHomeBtn]]));
  }

  const caption = [
    `💳 <b>AUTOGOPAY</b>`,
    `🔖 <code>${order.invoice}</code>  ·  💵 <b>${rupiah(order.total)}</b>`,
    ``,
    `📲 Scan QRIS di atas dengan aplikasi <b>GoPay / OVO / Dana / ShopeePay / BCA / Mandiri</b> (semua QRIS).`,
    `⏳ Berlaku ${Math.floor((new Date(order.expiresAt) - Date.now())/60000)} menit`,
    ``,
    `<i>Pembayaran akan diverifikasi otomatis dalam beberapa detik setelah pembayaran berhasil. Produk dikirim otomatis.</i>`,
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Cek Status Pembayaran', `agcheck:${order.invoice}`)],
    [Markup.button.callback('🔁 Ganti Metode', `o:${order.invoice}`)],
    [Markup.button.callback('❌ Batalkan', `ocancel:${order.invoice}`)],
    [backHomeBtn],
  ]);

  // Delete previous main msg, send new photo
  const user = ctx.state.user;
  if (user && user.mainMessageId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, user.mainMessageId); } catch {}
  }
  const msg = await ctx.replyWithPhoto(photoSource, { caption, parse_mode: 'HTML', reply_markup: kb.reply_markup });
  if (user) { user.mainMessageId = msg.message_id; await user.save().catch(()=>{}); }
}

// Manual status check button — polls AutoGoPay; if paid → deliver
async function checkAutogopayStatus(ctx, invoice) {
  const autogopay = require('../services/autogopay');
  const autogopaySvc = require('../services/autogopayService');
  const order = await Order.findOne({ invoice, userId: ctx.state.user.telegramId });
  if (!order) { try { await ctx.answerCbQuery('Order tidak ditemukan'); } catch {}; return; }
  const payment = await Payment.findOne({ orderId: order._id, method: 'autogopay' });
  if (!payment) { try { await ctx.answerCbQuery('Payment tidak ditemukan'); } catch {}; return; }
  if (payment.status === 'success' && order.status === 'delivered') {
    try { await ctx.answerCbQuery('Sudah lunas ✅'); } catch {}
    return showOrderDetail(ctx, invoice);
  }
  const PaymentMethod = require('../models/PaymentMethod');
  const method = await PaymentMethod.findOne({ code: 'autogopay' });
  const cfg = (method && method.config) || {};
  const r = await autogopay.checkStatus(cfg, payment.externalRef || invoice);
  if (!r.ok) { try { await ctx.answerCbQuery('Cek gagal: ' + r.error); } catch {}; return; }
  const status = String(r.status || '').toLowerCase();

if ([
    'settlement',
    'paid',
    'success',
    'completed'
].includes(status)) {

    await autogopaySvc.processSuccess(payment, ctx.telegram);

    return showOrderDetail(ctx, invoice);
}

  try { await ctx.answerCbQuery(`Status: ${r.status || 'pending'} ⏳`); } catch {}
}

module.exports.checkAutogopayStatus = checkAutogopayStatus;
