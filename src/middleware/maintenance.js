// Global maintenance gate: when maintenanceMode is ON, block all non-admin user activity.
const Settings = require('../models/Settings');
const { isAdmin } = require('./auth');

const LINE = '━━━━━━━━━━━━━━━━━━';
const DEFAULT_TEXT = [
  LINE,
  '🛠 <b>BOT SEDANG MAINTENANCE</b>',
  '',
  'Mohon maaf, Bot sedang dalam proses maintenance atau migrasi sistem.',
  '',
  'Seluruh data akun dan riwayat Anda tetap aman.',
  '',
  'Silakan coba kembali beberapa saat lagi.',
  '',
  '<i>Terima kasih atas pengertiannya.</i>',
  LINE,
].join('\n');

async function maintenanceGate(ctx, next) {
  try {
    const uid = ctx.from && ctx.from.id;
    // Always allow non-user updates (channel posts, etc.)
    if (!uid) return next();
    const s = await Settings.get();
    if (!s.maintenanceMode) return next();
    // Admin bypass (if allowed)
    if (isAdmin(uid) && s.maintenanceAllowAdmin !== false) return next();

    const text = s.tplMaintenance && s.tplMaintenance.trim() ? s.tplMaintenance : DEFAULT_TEXT;
    const fileId = s.maintenanceBannerFileId;
    const caption = s.maintenanceBannerCaption || text;

    // Answer callback silently
    if (ctx.callbackQuery) { try { await ctx.answerCbQuery('🛠 Maintenance'); } catch {} }

    try {
      if (fileId) {
        await ctx.replyWithPhoto(fileId, { caption, parse_mode: 'HTML' });
      } else {
        await ctx.reply(text, { parse_mode: 'HTML' });
      }
    } catch {}
    return; // stop pipeline
  } catch (e) {
    return next();
  }
}

module.exports = maintenanceGate;
module.exports.DEFAULT_TEXT = DEFAULT_TEXT;
