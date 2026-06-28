const { Schema, model } = require('mongoose');

const PaymentSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
  invoice: { type: String, index: true },
  userId: Number,
  method: String,
  amount: Number,
  status: { type: String, enum: ['pending', 'verifying', 'success', 'failed', 'expired'], default: 'pending' },
  proofFileId: String,
  externalRef: String,
  notes: String,
  verifiedBy: Number,
  verifiedAt: Date,
}, { timestamps: true });

module.exports = model('Payment', PaymentSchema);
