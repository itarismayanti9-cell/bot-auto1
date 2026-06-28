const mongoose = require('mongoose');
const { MONGODB_URI } = require('./config');
const log = require('./utils/logger');

mongoose.set('strictQuery', true);

async function connect() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 20,
    });
    log.info('✅ MongoDB connected');
  } catch (err) {
    log.error('❌ MongoDB connection failed', err);
    setTimeout(connect, 5000);
  }
}

mongoose.connection.on('disconnected', () => {
  log.warn('⚠️ MongoDB disconnected, reconnecting...');
});
mongoose.connection.on('error', (err) => log.error('Mongo error', err));

module.exports = { connect, mongoose };
