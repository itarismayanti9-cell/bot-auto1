const { Schema, model } = require('mongoose');

const PaymentMethodSchema = new Schema({
  code: { type: String, unique: true, required: true }, // qris, dana, ovo, gopay, shopeepay, bank, tripay, binance
  label: String,
  type: { type: String, enum: ['manual', 'gateway'], default: 'manual' },
  accountName: String,
  accountNumber: String,
  qrisFileId: String,
  instructions: String,
  config: { type: Schema.Types.Mixed, default: {} }, // for gateway keys etc
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = model('PaymentMethod', PaymentMethodSchema);
