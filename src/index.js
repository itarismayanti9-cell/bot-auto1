const cron = require('node-cron');
const { connect, mongoose } = require('./db');
const bot = require('./bot');
const orderSvc = require('./services/orderService');
const { dropStaleIndexes } = require('./migrate');
const { seedAutogopay } = require('./migrate');
const webhook = require('./webhook');
const log = require('./utils/logger');

async function main() {
  await connect();
  await dropStaleIndexes(mongoose);
  await seedAutogopay();

  // Start HTTP webhook server (AutoGoPay callbacks + health)
  const port = parseInt(process.env.PORT || process.env.WEB_PORT || '8080', 10);
  webhook.start(bot.telegram, port);

  // Cron: expire pending orders every minute
  cron.schedule('* * * * *', async () => {
    try {
      const n = await orderSvc.expireOldOrders();
      if (n) log.info(`Expired ${n} stale orders`);
    } catch (e) { log.error('cron expire', e); }
  });

  await bot.launch({ dropPendingUpdates: true });
  log.info('🤖 Bot started');
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Global error guards
process.on('unhandledRejection', (r) => log.error('unhandledRejection', r));
process.on('uncaughtException', (e) => log.error('uncaughtException', e));

main().catch((e) => {
  log.error('fatal', e);
  process.exit(1);
});
