const { ADMIN_IDS } = require('../config');
const Settings = require('../models/Settings');
const log = require('../utils/logger');

async function notifyAdmins(telegram, text, extra = {}) {
  const s = await Settings.get();
  if (!s.adminNotificationEnabled) return;
  for (const id of ADMIN_IDS) {
    try { await telegram.sendMessage(id, text, { parse_mode: 'HTML', ...extra }); } catch (e) { log.warn('notify admin', id, e.message); }
  }
}

module.exports = { notifyAdmins };
