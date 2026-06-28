// Simple in-memory rate limiter: max N actions per window
const buckets = new Map();
const MAX = 25;
const WINDOW_MS = 10_000;

module.exports = async (ctx, next) => {
  const id = ctx.from && ctx.from.id;
  if (!id) return next();
  const now = Date.now();
  const b = buckets.get(id) || { count: 0, reset: now + WINDOW_MS };
  if (now > b.reset) { b.count = 0; b.reset = now + WINDOW_MS; }
  b.count++;
  buckets.set(id, b);
  if (b.count > MAX) {
    if (ctx.callbackQuery) {
      try { await ctx.answerCbQuery('⏳ Terlalu cepat, coba lagi sebentar.', { show_alert: false }); } catch {}
    }
    return;
  }
  return next();
};
