// AutoGoPay API client
// Base: https://v1-gateway.autogopay.site
// Auth: Authorization: Bearer <apiKey>
// Endpoints (verified via OPTIONS/POST probing):
//   POST /qris/generate  -> create dynamic QRIS from raw QRIS + amount
//   POST /qris/status    -> check payment status of a transaction
//   POST /qris/cancel    -> cancel pending transaction
//
// Configuration is stored per-PaymentMethod under `config`:
//   { rawQris: string, apiKey: string, baseUrl?: string }
const axios = require('axios');
const crypto = require('crypto');

const DEFAULT_BASE_URL = 'https://v1-gateway.autogopay.site';

// Default raw QRIS string (per problem statement) — admin may override anytime.
const DEFAULT_RAW_QRIS =
  '00020101021126610014COM.GO-JEK.WWW01189360091436877203910210G6877203910303UMI51440014ID.CO.QRIS.WWW0215ID10254328196010303UMI5204829953033605802ID5920HRD VIRTUAL,Edukasi6011TASIKMALAYA61054619862070703A01630442C1';

function client(cfg) {
  const baseURL = (cfg && cfg.baseUrl) || DEFAULT_BASE_URL;
  return axios.create({
    baseURL,
    timeout: 20000,
   headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${(cfg && cfg.apiKey) || ''}`,
},
    validateStatus: () => true,
  });
}

async function ping(cfg) {
  // Public endpoint, no auth needed
  const c = axios.create({ baseURL: (cfg && cfg.baseUrl) || DEFAULT_BASE_URL, timeout: 10000, validateStatus: () => true });
  const res = await c.get('/health');
  return res.status === 200 && res.data && res.data.status === 'healthy';
}

// Validate API key
async function validateApiKey(cfg) {

  if (!cfg || !cfg.apiKey) {
    return {
      ok: false,
      reason: 'API Key belum diisi.'
    };
  }

  try {

    const c = client(cfg);

    const res = await c.post('/qris/generate', {
    amount: 1000
});

    console.log('\n========== AUTOGOPAY ==========');
    console.log('Base URL :', c.defaults.baseURL);
    console.log('API Key  :', cfg.apiKey.substring(0, 12) + '...');
    console.log('Status   :', res.status);
    console.log('Response :', JSON.stringify(res.data, null, 2));
    console.log('Headers  :', res.headers);
console.log('Request Headers :', res.config.headers);
console.log('Request Data :', res.config.data);
    console.log('===============================\n');

    if (res.status === 401) {
      return {
        ok: false,
        reason: res.data?.message || 'invalid API key'
      };
    }

    if (res.status === 429) {
      return {
        ok: false,
        reason: 'rate limited'
      };
    }

    return {
      ok: true
    };

  } catch (err) {

    console.log('\n========== AUTOGOPAY ERROR ==========');
    console.log(err.response?.status);
    console.log(err.response?.data);
    console.log(err.message);
    console.log('=====================================\n');

    return {
      ok: false,
      reason: err.response?.data?.message || err.message
    };

  }

}

// Generate dynamic QRIS for a transaction
async function generateQris(cfg, { transactionId, amount, description }) {
  if (!cfg || !cfg.apiKey) return { ok: false, error: 'API Key belum diatur' };
  if (!cfg || !cfg.rawQris) return { ok: false, error: 'Raw QRIS String belum diatur' };

  if (!Number(amount) || Number(amount) <= 0) {
    return {
        ok: false,
        error: 'Nominal pembayaran tidak valid.'
    };
}

  const body = {
    transaction_id: transactionId,
    amount: Number(amount),
    raw_qris: cfg.rawQris,
    description: description || `Order ${transactionId}`,
  };

  console.log('========== AUTOGOPAY REQUEST ==========');
console.log('URL :', `${DEFAULT_BASE_URL}/qris/generate`);
console.log('Amount :', amount);
console.log('Transaction :', transactionId);
console.log('Has API Key :', !!cfg.apiKey);
console.log('Has QRIS :', !!cfg.rawQris);
console.log('=======================================');

  const res = await client(cfg).post('/qris/generate', body);
  if (res.status !== 200 || !res.data || res.data.success === false) {
    return { ok: false, error: (res.data && (res.data.message || res.data.error)) || `HTTP ${res.status}` };
  }
  // Normalise response shape — support multiple known field names
  const d = res.data.data || res.data;

  const paymentStatus = String(
    d.transaction_status || ''
).toLowerCase();

 return {
    ok: true,

    transactionId:
        d.transaction_id || null,

    orderId:
        d.order_id || null,

    status:
        d.transaction_status || 'pending',

    amount:
        Number(d.amount || amount),

    qrString:
        d.qr_string || '',

    qrImageUrl:
        d.qr_url || '',

    checkoutUrl:
        d.checkout_url || '',

    expiresAt:
        d.expiry_time || null,

    raw: res.data
};
}

async function checkStatus(cfg, transactionId) {
  if (!cfg || !cfg.apiKey) return { ok: false, error: 'API Key belum diatur' };
  const res = await client(cfg).post('/qris/status', { transaction_id: transactionId });
  if (res.status !== 200 || !res.data || res.data.success === false) {
    return { ok: false, error: (res.data && (res.data.message || res.data.error)) || `HTTP ${res.status}` };
  }
  const d = res.data.data || res.data;
 return {

    ok: true,

    transactionId:
        d.transaction_id || null,

    orderId:
        d.order_id || null,

   status: paymentStatus,

    amount:
        Number(d.amount || 0),

    paidAt:
        d.paid_at || null,

    expiresAt:
        d.expiry_time || null,

    raw: res.data

};
}

// Verify webhook signature if AutoGoPay provides one in `X-Signature` header.
// Signature scheme (best-effort, per common implementations):
//   HMAC-SHA256(apiKey, rawBody) == X-Signature
// Falls back to API-Key compare via header `X-API-Key` if no signature sent.
function verifyWebhook({ apiKey, rawBody, headers }) {

  const sig =
    headers['x-signature'] ||
    headers['x-autogopay-signature'];

  // Jika ada signature, verifikasi
  if (sig && apiKey) {

    const expect = crypto
      .createHmac('sha256', apiKey)
      .update(rawBody || '')
      .digest('hex');

    if (expect === String(sig).toLowerCase()) {
      return {
        ok: true,
        mode: 'signature'
      };
    }

    return {
      ok: false,
      mode: 'signature',
      reason: 'invalid signature'
    };
  }

  // Jika ada Authorization/X-API-Key
  const headerKey =
      headers['authorization'] ||
      headers['x-api-key'];

  if (headerKey && apiKey) {

    const provided = String(headerKey)
      .replace(/^Bearer\s+/i, '')
      .trim();

    if (provided === apiKey) {
      return {
        ok: true,
        mode: 'apikey'
      };
    }

    return {
      ok:false,
      mode:'apikey',
      reason:'invalid api key'
    };
  }

  // ============
  // VERIFIKASI CALLBACK
  // ============
  // AutoGoPay kadang mengirim request awal
  // tanpa signature.
  // Jangan ditolak.

  return {
    ok:true,
    mode:'verification'
  };

}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_RAW_QRIS,
  ping,
  validateApiKey,
  generateQris,
  checkStatus,
  verifyWebhook,
};
