const Settings = require('../models/Settings');
const { Markup } = require('telegraf');
const { box } = require('../utils/ui');
const { isAdmin } = require('./auth');

module.exports = async (ctx, next) => {
  if (isAdmin(ctx.from && ctx.from.id)) return next();
  const s = await Settings.get();
  if (!s.joinChannelRequired || !s.channelId) return next();

  // skip check on the verify callback itself
  if (ctx.callbackQuery && ctx.callbackQuery.data === 'jc:check') return next();

  try {
    const member = await ctx.telegram.getChatMember(s.channelId, ctx.from.id);
    const ok = ['creator', 'administrator', 'member'].includes(member.status);
    if (ok) {
      if (ctx.state.user && !ctx.state.user.joinedChannel) {
        ctx.state.user.joinedChannel = true;
        await ctx.state.user.save().catch(()=>{});
      }
      return next();
    }
  } catch (_) {}

  const link = s.channelLink || (s.channelId.startsWith('@') ? `https://t.me/${s.channelId.slice(1)}` : '');
  const kb = Markup.inlineKeyboard([
    [Markup.button.url('📢 Join Channel', link || 'https://t.me')],
    [Markup.button.callback('✅ Cek Ulang', 'jc:check')],
  ]);
  const text = box('🔒 JOIN CHANNEL', [s.tplJoinChannel || 'Anda harus bergabung ke channel terlebih dahulu.']);

  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb }); } catch { await ctx.reply(text, { parse_mode: 'HTML', ...kb }); }
    try { await ctx.answerCbQuery(); } catch {}
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', ...kb });
  }
};
