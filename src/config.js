require('dotenv').config();

const required = ['BOT_TOKEN', 'MONGODB_URI', 'ADMIN_IDS'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`❌ Missing required env: ${k}`);
    process.exit(1);
  }
}

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGODB_URI: process.env.MONGODB_URI,
  ADMIN_IDS: process.env.ADMIN_IDS.split(',').map(s => s.trim()).filter(Boolean).map(Number),
  NODE_ENV: process.env.NODE_ENV || 'production',
};
