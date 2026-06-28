const { ADMIN_IDS } = require('../config');

const isAdmin = (id) => ADMIN_IDS.includes(Number(id));

const requireAdmin = async (ctx, next) => {
  if (!isAdmin(ctx.from && ctx.from.id)) {
    if (ctx.callbackQuery) {
      try { await ctx.answerCbQuery('❌ Akses ditolak', { show_alert: true }); } catch {}
    } else {
      await ctx.reply('❌ Anda tidak memiliki akses ke Admin Panel.');
    }
    return;
  }
  ctx.state.isAdmin = true;
  return next();
};

module.exports = { isAdmin, requireAdmin };
