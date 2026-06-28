// Safe message edit/send helpers for clean-chat navigation
const log = require('./logger');

async function safeEdit(ctx, text, extra = {}) {
  try {
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const msg = ctx.callbackQuery.message;
      if (msg.photo || msg.video || msg.document) {
        return await ctx.editMessageCaption(text, { parse_mode: 'HTML', ...extra });
      }
      return await ctx.editMessageText(text, { parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
    }
  } catch (e) {
    if (!String(e.message).includes('not modified')) {
      log.debug('safeEdit fallback', e.message);
    }
  }
  // fallback: send + remember main message
  return await sendMain(ctx, text, extra);
}

async function sendMain(ctx, text, extra = {}) {
  const user = ctx.state.user;
  // delete previous main message if exists
  if (user && user.mainMessageId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, user.mainMessageId); } catch {}
  }
  const msg = await ctx.reply(text, { parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
  if (user) {
    user.mainMessageId = msg.message_id;
    await user.save().catch(()=>{});
  }
  return msg;
}

async function sendPhoto(ctx, fileId, caption, extra = {}) {
  const user = ctx.state.user;
  if (user && user.mainMessageId) {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, user.mainMessageId); } catch {}
  }
  const msg = await ctx.replyWithPhoto(fileId, { caption, parse_mode: 'HTML', ...extra });
  if (user) { user.mainMessageId = msg.message_id; await user.save().catch(()=>{}); }
  return msg;
}

async function deleteUserMessage(ctx) {
  try { await ctx.deleteMessage(ctx.message.message_id); } catch {}
}

async function editOrPhoto(ctx, fileId, text, extra = {}) {
  // If no banner, use plain safeEdit
  if (!fileId) return safeEdit(ctx, text, extra);
  try {
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      const msg = ctx.callbackQuery.message;
      if (msg.photo) {
        return await ctx.editMessageMedia(
          { type: 'photo', media: fileId, caption: text, parse_mode: 'HTML' },
          { ...extra }
        );
      }
    }
  } catch (e) {
    if (!String(e.message).includes('not modified')) {
      log.debug('editOrPhoto fallback', e.message);
    }
  }
  return sendPhoto(ctx, fileId, text, extra);
}

module.exports = { safeEdit, sendMain, sendPhoto, deleteUserMessage, editOrPhoto };
