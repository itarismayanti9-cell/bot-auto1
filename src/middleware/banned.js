const { isAdmin } = require('./auth');
module.exports = async (ctx, next) => {
  const u = ctx.state.user;
  if (u && u.banned && !isAdmin(ctx.from.id)) {
    try {
      if (ctx.callbackQuery) await ctx.answerCbQuery('🚫 Akun Anda diblokir.', { show_alert: true });
      else await ctx.reply('🚫 Akun Anda diblokir oleh admin.');
    } catch {}
    return;
  }
  return next();
};
