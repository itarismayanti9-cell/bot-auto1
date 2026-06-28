// Quick integration smoke test for AutoGoPay webhook + admin config
// Run: node tests/autogopay.smoke.js
process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'TEST:FAKE_TOKEN_FOR_VALIDATION_ONLY';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/digital-store-autogopay-test';
process.env.ADMIN_IDS = process.env.ADMIN_IDS || '1';
process.env.BASE_URL = process.env.BASE_URL || 'https://example.onrender.com';

const assert = require('assert');
const http = require('http');

(async () => {
  const { connect, mongoose } = require('../src/db');
  await connect();
  // Wipe test DB collections we touch
  for (const c of ['paymentmethods','payments','orders','products','stocks','users']) {
    try { await mongoose.connection.db.collection(c).deleteMany({}); } catch {}
  }

  const { seedAutogopay } = require('../src/migrate');
  await seedAutogopay();

  const PaymentMethod = require('../src/models/PaymentMethod');
  const Product = require('../src/models/Product');
  const Stock = require('../src/models/Stock');
  const Order = require('../src/models/Order');
  const Payment = require('../src/models/Payment');

  // Configure AutoGoPay
  const apiKey = 'TEST_API_KEY_12345';
  const m = await PaymentMethod.findOne({ code: 'autogopay' });
  assert(m, 'autogopay seeded');
  assert(m.config && m.config.rawQris && m.config.rawQris.startsWith('000201'), 'default raw QRIS present');
  m.config.apiKey = apiKey;
  m.active = true;
  m.markModified('config');
  await m.save();
  console.log('✅ Seed + config OK');

  // Create order + stock + payment
  const product = await Product.create({ name: 'Test Akun', price: 5000, active: true });
  await Stock.create({ productId: product._id, content: 'user:pass\nkey:abc', status: 'available' });
  const order = await Order.create({
    invoice: 'INV-TEST-AGP-1',
    userId: 1,
    productId: product._id,
    productName: product.name,
    quantity: 1,
    unitPrice: product.price,
    total: product.price,
    status: 'pending',
    paymentMethod: 'autogopay',
    paymentRef: 'INV-TEST-AGP-1',
    expiresAt: new Date(Date.now() + 30*60_000),
  });
  // Reserve stock for this order
  const stockSvc = require('../src/services/stockService');
  const reserved = await stockSvc.reserveStock(product._id, 1, 1, order._id);
  order.reservedStockIds = reserved.map(r=>r._id); await order.save();

  const payment = await Payment.create({
    orderId: order._id, invoice: order.invoice, userId: 1,
    method: 'autogopay', amount: order.total, status: 'pending',
    externalRef: order.invoice,
  });
  console.log('✅ Order + Payment + Stock seeded');

  // Build webhook app with stub telegram
  const stub = { sendMessage: async () => ({}), sendPhoto: async () => ({}) };
  const webhook = require('../src/webhook');
  const app = webhook.buildApp(stub);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  const port = server.address().port;

  async function postWebhook(body, headers = {}) {
    return await new Promise((resolve) => {
      const data = JSON.stringify(body);
      const req = http.request({
        host: '127.0.0.1', port, path: '/webhook/autogopay', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      }, (res) => {
        let chunks = '';
        res.on('data', d => chunks += d);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(chunks || '{}') }));
      });
      req.write(data); req.end();
    });
  }

  // 1) Missing auth → 401
  let r = await postWebhook({ transaction_id: order.invoice, amount: order.total, status: 'paid' });
  assert.strictEqual(r.status, 401, 'reject without auth');
  console.log('✅ Reject unauthenticated webhook');

  // 2) Wrong key → 401
  r = await postWebhook({ transaction_id: order.invoice, amount: order.total, status: 'paid' }, { 'X-API-Key': 'WRONG' });
  assert.strictEqual(r.status, 401, 'reject wrong key');
  console.log('✅ Reject wrong API key');

  // 3) Amount mismatch
  r = await postWebhook({ transaction_id: order.invoice, amount: 1, status: 'paid' }, { 'X-API-Key': apiKey });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /amount/);
  console.log('✅ Reject amount mismatch');

  // 4) Successful callback → delivers
  r = await postWebhook({ transaction_id: order.invoice, amount: order.total, status: 'paid' }, { 'X-API-Key': apiKey });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
  console.log('✅ Webhook success accepted');

  const reloadedOrder = await Order.findById(order._id);
  const reloadedPay = await Payment.findById(payment._id);
  assert.strictEqual(reloadedPay.status, 'success', 'payment success');
  assert.strictEqual(reloadedOrder.status, 'delivered', 'order delivered');
  assert(reloadedOrder.deliveredContent && reloadedOrder.deliveredContent.length === 1, 'product delivered');
  console.log('✅ Auto-delivery executed, product = "' + reloadedOrder.deliveredContent[0].replace(/\n/g,' / ') + '"');

  // 5) Duplicate callback → idempotent
  r = await postWebhook({ transaction_id: order.invoice, amount: order.total, status: 'paid' }, { 'X-API-Key': apiKey });
  assert.strictEqual(r.status, 200);
  console.log('✅ Idempotent on duplicate callback');

  // 6) HMAC signature path
  const crypto = require('crypto');
  const rawBody = JSON.stringify({ transaction_id: order.invoice, amount: order.total, status: 'paid' });
  const sig = crypto.createHmac('sha256', apiKey).update(rawBody).digest('hex');
  r = await postWebhook({ transaction_id: order.invoice, amount: order.total, status: 'paid' }, { 'X-Signature': sig });
  assert.strictEqual(r.status, 200, 'signature verify accepts');
  console.log('✅ HMAC signature path accepted');

  // 7) Bad signature
  r = await postWebhook({ transaction_id: order.invoice, amount: order.total, status: 'paid' }, { 'X-Signature': 'baadbaadbaad' });
  assert.strictEqual(r.status, 401);
  console.log('✅ Bad signature rejected');

  // 8) Unknown transaction → 404
  r = await postWebhook({ transaction_id: 'INV-DOES-NOT-EXIST', amount: 1, status: 'paid' }, { 'X-API-Key': apiKey });
  assert.strictEqual(r.status, 404);
  console.log('✅ Unknown transaction → 404');

  // 9) Method disabled → 403
  m.active = false; await m.save();
  r = await postWebhook({ transaction_id: order.invoice, amount: order.total, status: 'paid' }, { 'X-API-Key': apiKey });
  assert.strictEqual(r.status, 403);
  console.log('✅ Disabled method → 403');

  server.close();
  await mongoose.disconnect();
  console.log('\n🎉 ALL AUTOGOPAY WEBHOOK TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
