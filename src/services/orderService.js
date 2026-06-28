const Order = require('../models/Order');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const { generateInvoice } = require('../utils/invoice');
const stockSvc = require('./stockService');

async function createOrder({ userId, productId, quantity }) {
  const product = await Product.findById(productId);
  if (!product || !product.active) return { error: 'Produk tidak tersedia.' };
  const available = await stockSvc.countAvailable(productId);
  if (available < quantity) return { error: `Stock tidak mencukupi. Tersedia: ${available}` };

  const settings = await Settings.get();
  const invoice = generateInvoice();
  const expiresAt = new Date(Date.now() + (settings.invoiceExpiryMinutes || 30) * 60_000);
  const total = product.price * quantity;

  const order = await Order.create({
    invoice,
    userId,
    productId,
    productName: product.name,
    quantity,
    unitPrice: product.price,
    total,
    expiresAt,
  });

  const reserved = await stockSvc.reserveStock(productId, quantity, userId, order._id);
  if (!reserved) {
    order.status = 'failed';
    await order.save();
    return { error: 'Gagal mengunci stock. Coba lagi.' };
  }
  order.reservedStockIds = reserved.map(r => r._id);
  await order.save();
  return { order };
}

async function cancelOrder(order) {
  if (['delivered', 'paid'].includes(order.status)) return false;
  order.status = 'cancelled';
  await order.save();
  await stockSvc.releaseStock(order._id);
  return true;
}

async function deliverOrder(order) {
  const contents = await stockSvc.markSold(order._id);
  order.deliveredContent = contents;
  order.status = 'delivered';
  order.deliveredAt = new Date();
  order.paidAt = order.paidAt || new Date();
  await order.save();

  // Update product sold counter
  await Product.findByIdAndUpdate(order.productId, { $inc: { sold: order.quantity } });
  return contents;
}

// Expire pending orders (cron)
async function expireOldOrders() {
  const now = new Date();
  const expired = await Order.find({ status: 'pending', expiresAt: { $lt: now } });
  for (const o of expired) {
    o.status = 'expired';
    await o.save();
    await stockSvc.releaseStock(o._id);
  }
  return expired.length;
}

module.exports = { createOrder, cancelOrder, deliverOrder, expireOldOrders };
