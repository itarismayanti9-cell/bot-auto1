// Compact, premium UI helpers
const SEP = '━━━━━━━━━━━━';
const ACCOUNT_DELIM = '====================';

const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');

const escape = (s) => String(s || '').replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

// Compact block: title (bold) + tight lines, no big separators
const box = (title, lines = []) => {
  const body = lines.filter(l => l !== undefined && l !== null && l !== '').join('\n');
  return `<b>${title}</b>\n${body}`;
};

const loading = (text = 'Memproses') => `⏳ <i>${text}…</i>`;
const ok = (title, body) => `✅ <b>${title}</b>\n${body}`;
const err = (title, body) => `❌ <b>${title}</b>\n${body}`;

module.exports = { SEP, ACCOUNT_DELIM, rupiah, escape, box, loading, ok, err };
