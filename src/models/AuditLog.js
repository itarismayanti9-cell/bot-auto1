const { Schema, model } = require('mongoose');

const AuditLogSchema = new Schema({
  actorId: Number,
  actorRole: String,
  action: String,
  target: String,
  meta: Schema.Types.Mixed,
}, { timestamps: true });

AuditLogSchema.index({ createdAt: -1 });

module.exports = model('AuditLog', AuditLogSchema);
