// HTTP webhook server for AutoGoPay (and health check on Render).
// Listens on PORT (default 8080). Routes:
//   GET  /          → API root
//   GET  /health    → health check
//   POST /webhook/autogopay → callback handler
const express = require('express');
const Payment = require('./models/Payment');
const Order = require('./models/Order');
const PaymentMethod = require('./models/PaymentMethod');
const autogopay = require('./services/autogopay');
const autogopaySvc = require('./services/autogopayService');
const log = require('./utils/logger');

function buildApp(telegram) {
  const app = express();
  // Keep raw body for signature verification
  app.use('/webhook', express.raw({ type: '*/*', limit: '256kb' }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/', (req, res) => res.json({ ok: true, name: 'digital-store-bot', webhook: '/webhook/autogopay' }));
  app.get('/health', (req, res) => res.json({ status: 'healthy', ts: Date.now() }));

  app.post('/webhook/autogopay', async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    let payload = {};
    try { payload = JSON.parse(rawBody || '{}'); } catch { payload = {}; }

    // Lower-case headers for consistent lookup
    const headers = {};
    for (const k of Object.keys(req.headers || {})) headers[k.toLowerCase()] = req.headers[k];

    const method = await PaymentMethod.findOne({ code: 'autogopay' });
    if (!method) {
      log.warn('webhook autogopay: method not configured');
      return res.status(404).json({ ok: false, error: 'autogopay not configured' });
    }
    if (!method.active) {
      return res.status(403).json({ ok: false, error: 'autogopay disabled' });
    }
    const cfg = method.config || {};

    // 1) Verify signature / API key (anti-replay)
    log.info('========== AUTOGOPAY WEBHOOK ==========');

log.info(rawBody);

log.info(headers);

log.info('=======================================');
    const verify = autogopay.verifyWebhook({ apiKey: cfg.apiKey, rawBody, headers });
    if (!verify.ok) {
      log.warn('webhook autogopay verify failed', verify);
      return res.status(401).json({ ok: false, error: verify.reason || 'unauthorized' });
    }

    // 2) Extract identifiers
    const transactionId =

payload.transaction_id ||

payload.reference_id ||

payload.transactionId ||

payload.invoice ||

payload.order_id ||

null;
    const statusIn = String(

    payload.transaction_status ||

    payload.status ||

    payload.payment_status ||

    ''

).toLowerCase();
   const amountIn = Number(

    payload.amount ||

    payload.total ||

    payload.total_amount ||

    0

);

// Callback verification dari AutoGoPay
if (!transactionId) {
    log.info("AutoGoPay callback verification");

    return res.status(200).json({
        success: true,
        message: "Webhook OK"
    });
}

    // 3) Find payment by transaction_id (stored in externalRef) — idempotent
    const payment = await Payment.findOne({ externalRef: transactionId, method: 'autogopay' });
    if (!payment) {
      log.warn('webhook autogopay payment not found', transactionId);
      return res.status(404).json({ ok: false, error: 'payment not found' });
    }

    // 4) Anti-double payment: already success
    if (payment.status === 'success') {
    log.info(
    `Webhook diterima dengan status ${statusIn}`
);

return res.json({

    ok:true,

    message:'Webhook diterima',

    status:statusIn

});
    }

    // 5) Map status
    const successStates = [
    'settlement',
    'paid',
    'success',
    'completed',
    'settled',
    'success_payment'
];

const failedStates = [
    'expire',
    'expired',
    'failed',
    'cancel',
    'cancelled',
    'canceled'
];

    if (successStates.includes(statusIn)) {
      // Amount sanity check (anti tampering)
      if (amountIn && payment.amount && Math.abs(amountIn - payment.amount) > 0.5) {
        log.warn('webhook amount mismatch', { expected: payment.amount, got: amountIn });
        return res.status(400).json({ ok: false, error: 'amount mismatch' });
      }
      const r = await autogopaySvc.processSuccess(payment, telegram);
      if (!r.ok) return res.status(500).json({ ok: false, error: r.error || 'process failed' });
      return res.json({ ok: true, invoice: payment.invoice, delivered: r.delivered || 0, alreadyProcessed: !!r.alreadyProcessed });
    }

    if (failedStates.includes(statusIn)) {
      if (payment.status !== 'failed') {
        payment.status = 'failed'; payment.verifiedAt = new Date(); await payment.save();
        const order = await Order.findById(payment.orderId);
        if (order && order.status === 'pending') {
          order.status = 'expired'; await order.save();
          try { await require('./services/stockService').releaseStock(order._id); } catch {}
        }
      }
      return res.json({ ok: true, message: 'marked failed', invoice: payment.invoice });
    }

    // Pending / unknown — just ack
    return res.json({ ok: true, message: 'noted', status: statusIn });
  });

  // 404
  app.use((req, res) => res.status(404).json({ ok: false, error: 'not found' }));
  return app;
}

function start(telegram, port) {
  const app = buildApp(telegram);
  const server = app.listen(port, '0.0.0.0', () => {
    log.info(`🌐 Webhook server listening on :${port}`);
  });
  server.on('error', (e) => log.error('webhook server', e));
  return server;
}

module.exports = { start, buildApp };
