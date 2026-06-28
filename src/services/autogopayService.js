// AutoGoPay payment processing — idempotent, anti-replay
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');
const orderSvc = require('./orderService');
const stockSvc = require('./stockService');
const { notifyAdmins } = require('./notify');
const { rupiah } = require('../utils/ui');
const log = require('../utils/logger');

async function getMethodConfig() {
  const m = await PaymentMethod.findOne({ code: 'autogopay' });
  if (!m) return null;
  return { method: m, config: m.config || {} };
}

// Mark payment success + auto-deliver. Idempotent: safe to call multiple times.
async function processSuccess(payment, telegram) {
  // Re-load fresh
  const p = await Payment.findById(payment._id);

  log.info('========== AUTOGOPAY SUCCESS ==========');
log.info(`Invoice : ${payment.invoice || '-'}`);
log.info(`Payment : ${payment._id}`);
log.info(`Status  : ${p?.status}`);
log.info('=======================================');

  if (!p) return { ok: false, error: 'payment not found' };
  if (p.status === 'success') {
    // Already processed — return existing delivery info
    const order = await Order.findById(p.orderId);
    return { ok: true, alreadyProcessed: true, order };
  }

  const order = await Order.findById(p.orderId);
  if (!order) return { ok: false, error: 'order not found' };
  if (['delivered', 'cancelled', 'expired'].includes(order.status)) {
    return { ok: false, error: `order already ${order.status}` };
  }

if (payment.transactionStatus) {
    const status = String(payment.transactionStatus).toLowerCase();

    if (status !== 'settlement') {
        return {
            ok: false,
            error: `Status pembayaran belum settlement (${status})`
        };
    }
}

p.status = 'success'; p.verifiedAt = new Date(); await p.save();
  order.status = 'paid'; order.paidAt = new Date(); await order.save();

  let contents = [];
  try {
    contents = await orderSvc.deliverOrder(order);
    if (!contents.length) {
      // FIFO fallback
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
    await User.updateOne({ telegramId: order.userId }, { $inc: { totalOrders: 1, totalSpent: order.total } });

    // Send product to user
    if (telegram) {
      const esc = (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const LINE = '━━━━━━━━━━━━━━━━━━━━━━';
      const blocks = contents.map((c, i) => `${LINE}\n📦 <b>AKUN ${i + 1}</b>\n<code>${esc(c)}</code>`).join('\n') + `\n${LINE}`;
      const text = `✅ <b>Pembayaran Berhasil</b> (AutoGoPay)\n🔖 <code>${order.invoice}</code>\n📦 ${order.productName} ×${order.quantity}\n💵 ${rupiah(order.total)}\n\n${blocks}\n\n<i>Terima kasih telah berbelanja!</i>`;
      try { await telegram.sendMessage(order.userId, text, { parse_mode: 'HTML' }); } catch (e) { log.warn('user notify', e.message); }
      await notifyAdmins(telegram,
        `✅ <b>AutoGoPay Sukses</b>\n🔖 ${order.invoice}\nUser: <code>${order.userId}</code>\nProduk: ${order.productName} ×${order.quantity}\nTotal: ${rupiah(order.total)}\nDikirim: ${contents.length} akun`);
    }
  } catch (e) {
    log.error('autogopay deliver', e);
    if (telegram) {
      try {
        await telegram.sendMessage(order.userId,
          `⚠️ Pembayaran <code>${order.invoice}</code> sudah diterima. Auto-delivery gagal: <i>${e.message}</i>. Admin akan memproses manual.`,
          { parse_mode: 'HTML' });
      } catch {}
    }
    return { ok: true, deliveryError: e.message, order };
  }
  return { ok: true, order, delivered: contents.length };
}

module.exports = { getMethodConfig, processSuccess };
