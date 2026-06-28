const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  telegramId: { type: Number, unique: true, index: true, required: true },
  username: String,
  firstName: String,
  lastName: String,
  joinedChannel: { type: Boolean, default: false },
  banned: { type: Boolean, default: false },
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  mainMessageId: Number,
  state: { type: Schema.Types.Mixed, default: {} },
  lastSeen: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = model('User', UserSchema);
