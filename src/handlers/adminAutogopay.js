// Admin handler — AutoGoPay configuration page.
// Callbacks: apag:<action>[:<arg>]
//   apag:open          → main config page
//   apag:raw           → input raw QRIS string
//   apag:key           → input API key
//   apag:url           → show webhook URL with copy/refresh
//   apag:test          → test connection (validate key + ping)
//   apag:on / apag:off → enable / disable
//   apag:back          → back to payment list
const { Markup } = require('telegraf');
const PaymentMethod = require('../models/PaymentMethod');
const AuditLog = require('../models/AuditLog');
const { box, ok, err } = require('../utils/ui');
const { safeEdit, deleteUserMessage } = require('../utils/safeEdit');
const autogopay = require('../services/autogopay');

const CODE = 'autogopay';

async function getOrCreate() {
  let m = await PaymentMethod.findOne({ code: CODE });
  if (!m) {
    m = await PaymentMethod.create({
      code: CODE,
      label: '🟢 AutoGoPay',
      type: 'gateway',
      active: false,
      instructions: 'Pembayaran otomatis via QRIS Dinamis AutoGoPay. Scan QRIS yang muncul untuk membayar.',
      config: { rawQris: autogopay.DEFAULT_RAW_QRIS, apiKey: '' },
    });
  }
  // Ensure config defaults
  m.config = m.config || {};
  if (!m.config.rawQris) m.config.rawQris = autogopay.DEFAULT_RAW_QRIS;
  if (m.config.apiKey === undefined) m.config.apiKey = '';
  m.markModified('config');
  await m.save();
  return m;
}

function webhookUrl() {
  const base = (process.env.BASE_URL || '').replace(/\/+$/, '');
  if (!base) return '(BASE_URL belum diatur — set env BASE_URL=https://your-domain.onrender.com)';
  return `${base}/webhook/autogopay`;
}

function mask(s) {
  if (!s) return '<i>(belum diisi)</i>';
  const str = String(s);
  if (str.length <= 8) return '••••' + str.slice(-2);
  return str.slice(0, 4) + '••••' + str.slice(-4);
}

async function audit(actorId, action, target, meta = {}) {
  await AuditLog.create({ actorId, actorRole: 'admin', action, target, meta }).catch(() => {});
}

async function showConfig(ctx) {
  const m = await getOrCreate();
  const cfg = m.config || {};
  const lines = [
    '<i>Konfigurasi pembayaran otomatis QRIS Dinamis.</i>',
    '',
    '<b>Untuk menggunakan AutoGoPay, isi:</b>',
    '1️⃣ <b>Raw QRIS String</b>',
    '   QRIS mentah yang dipakai AutoGoPay untuk',
    '   membuat QRIS dinamis tiap transaksi.',
    '2️⃣ <b>API Key</b>',
    '   Untuk autentikasi bot ↔ server AutoGoPay.',
    '',
    `📝 Raw QRIS : <code>${cfg.rawQris ? cfg.rawQris.slice(0, 40) + '…' : '(belum diisi)'}</code>`,
    `🔑 API Key  : ${mask(cfg.apiKey)}`,
    `🌐 Webhook  : <code>${webhookUrl()}</code>`,
    `📡 Status   : ${m.active ? '🟢 AKTIF' : '🔴 NONAKTIF'}`,
  ];
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('📝 Input Raw QRIS String', 'apag:raw')],
    [Markup.button.callback('🔑 Input API Key', 'apag:key')],
    [Markup.button.callback('🌐 Webhook URL', 'apag:url'), Markup.button.callback('🧪 Test Connection', 'apag:test')],
    m.active
      ? [Markup.button.callback('❌ Nonaktifkan', 'apag:off')]
      : [Markup.button.callback('✅ Aktifkan', 'apag:on')],
    [Markup.button.callback('⬅️ Kembali', 'a:pay')],
  ]);
  return safeEdit(ctx, box('🟢 AUTOGOPAY CONFIGURATION', lines), kb);
}

async function showWebhookUrl(ctx) {
  const url = webhookUrl();
  const lines = [
    '<b>URL Webhook AutoGoPay:</b>',
    `<code>${url}</code>`,
    '',
    '<i>URL ini dibuat otomatis dari BASE_URL aplikasi. Jika domain berubah, URL ini juga berubah otomatis.</i>',
    '',
    '<i>Daftarkan URL ini di dashboard AutoGoPay sebagai endpoint callback.</i>',
  ];
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('📋 Salin URL', 'apag:url:copy')],
    [Markup.button.callback('🔄 Refresh URL', 'apag:url')],
    [Markup.button.callback('⬅️ Kembali', 'apag:open')],
  ]);
  return safeEdit(ctx, box('🌐 WEBHOOK URL', lines), kb);
}

async function testConnection(ctx) {
  const m = await getOrCreate();
  const cfg = m.config || {};
  const issues = [];
  if (!cfg.rawQris) issues.push('Raw QRIS String belum diisi');
  if (!cfg.apiKey) issues.push('API Key belum diisi');
  if (issues.length) {
    return safeEdit(ctx, err('Test Connection Gagal', issues.map(i => `• ${i}`).join('\n')),
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'apag:open')]]));
  }
  const reachable = await autogopay.ping(cfg);
  if (!reachable) {
    return safeEdit(ctx, err('Test Connection Gagal', 'Tidak dapat menjangkau server AutoGoPay.'),
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'apag:open')]]));
  }
  const auth = await autogopay.validateApiKey(cfg);
  if (!auth.ok) {
    return safeEdit(ctx, err('Test Connection Gagal', `API Key invalid: ${auth.reason}`),
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'apag:open')]]));
  }
  return safeEdit(ctx, ok('AutoGoPay Berhasil Terhubung',
    [
      '• Server AutoGoPay reachable ✅',
      '• API Key valid ✅',
      '• Raw QRIS String terisi ✅',
      '',
      'Anda dapat mengaktifkan AutoGoPay.',
    ].join('\n')), Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'apag:open')]]));
}

async function setActive(ctx, active) {
  const m = await getOrCreate();
  const cfg = m.config || {};
  if (active && (!cfg.rawQris || !cfg.apiKey)) {
    return safeEdit(ctx, err('Tidak dapat diaktifkan', 'Lengkapi Raw QRIS String dan API Key terlebih dahulu.'),
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'apag:open')]]));
  }
  m.active = active; await m.save();
  await audit(ctx.from.id, 'autogopay.toggle', CODE, { active });
  return showConfig(ctx);
}

async function startInput(ctx, kind) {
  ctx.state.user.state = { admin: kind === 'raw' ? 'autogopay_raw' : 'autogopay_key' };
  await ctx.state.user.save();
  const title = kind === 'raw' ? '📝 Input Raw QRIS String' : '🔑 Input API Key';
  const body = kind === 'raw'
    ? 'Kirim Raw QRIS String (00020101… panjang). Bot akan validasi format dasar.'
    : 'Kirim API Key AutoGoPay Anda. <i>Disimpan terenkripsi di MongoDB.</i>';
  return safeEdit(ctx, box(title, [body]),
    Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', 'apag:open')]]));
}

async function handleText(ctx) {
  const u = ctx.state.user;
  const st = u.state || {};
  if (st.admin !== 'autogopay_raw' && st.admin !== 'autogopay_key') return false;
  const text = (ctx.message.text || '').trim();
  await deleteUserMessage(ctx);

  const m = await getOrCreate();
  m.config = m.config || {};
  if (st.admin === 'autogopay_raw') {
    if (!/^0002\d{2}/.test(text)) {
      await safeEdit(ctx, err('Raw QRIS Tidak Valid', 'Raw QRIS String harus diawali dengan <code>000201…</code>. Cek lagi dari aplikasi GoPay/QRIS Anda.'),
        Markup.inlineKeyboard([[Markup.button.callback('🔄 Coba Lagi', 'apag:raw')], [Markup.button.callback('⬅️ Kembali', 'apag:open')]]));
      u.state = {}; await u.save();
      return true;
    }
    m.config.rawQris = text;
  } else {
    if (text.length < 8) {
      await safeEdit(ctx, err('API Key Tidak Valid', 'API Key terlalu pendek.'),
        Markup.inlineKeyboard([[Markup.button.callback('🔄 Coba Lagi', 'apag:key')], [Markup.button.callback('⬅️ Kembali', 'apag:open')]]));
      u.state = {}; await u.save();
      return true;
    }
    m.config.apiKey = text;
  }
  m.markModified('config'); await m.save();
  await audit(ctx.from.id, st.admin === 'autogopay_raw' ? 'autogopay.set_raw' : 'autogopay.set_key', CODE);
  u.state = {}; await u.save();
  await showConfig(ctx);
  return true;
}

// Action dispatcher (called from bot.js)
async function handleAction(ctx, parts) {
  // parts: ['apag', action, ...]
  const action = parts[1] || 'open';
  if (action === 'open') return showConfig(ctx);
  if (action === 'raw')  return startInput(ctx, 'raw');
  if (action === 'key')  return startInput(ctx, 'key');
  if (action === 'url') {
    if (parts[2] === 'copy') {
      // Telegram doesn't support clipboard; reply with plain url so user can long-press to copy
      try { await ctx.answerCbQuery('URL ditampilkan untuk disalin'); } catch {}
      const url = webhookUrl();
      await ctx.reply(url);
      return;
    }
    return showWebhookUrl(ctx);
  }
  if (action === 'test') return testConnection(ctx);
  if (action === 'on')   return setActive(ctx, true);
  if (action === 'off')  return setActive(ctx, false);
  return showConfig(ctx);
}

module.exports = { showConfig, handleAction, handleText, getOrCreate, webhookUrl };
