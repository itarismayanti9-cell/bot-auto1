const User = require('../models/User');
const log = require('../utils/logger');

module.exports = async (ctx, next) => {
  try {
    const from = ctx.from;
    if (!from) return next();
    let user = await User.findOne({ telegramId: from.id });
    if (!user) {
      user = await User.create({
        telegramId: from.id,
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
      });
      ctx.state.isNewUser = true;
    } else {
      user.username = from.username;
      user.firstName = from.first_name;
      user.lastName = from.last_name;
      user.lastSeen = new Date();
    }
    ctx.state.user = user;
    await next();
    // Persist state changes after handler
    if (user.isModified()) await user.save().catch((e)=>log.warn('user save', e.message));
  } catch (e) {
    log.error('session mw', e);
    // Do NOT call next() again — it has already been invoked or is not safe to retry.
  }
};
