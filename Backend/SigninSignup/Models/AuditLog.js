const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  hotelId: { type: String, required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actorName: { type: String, required: true, trim: true, maxlength: 80 },
  actorRole: { type: String, required: true, enum: ["hotelAdmin", "staff", "admin"] },
  action: { type: String, required: true, trim: true, maxlength: 80 },
  entityType: { type: String, required: true, enum: ["roomType", "room", "reservation"] },
  entityId: { type: String, required: true, maxlength: 100 },
  changes: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

auditLogSchema.index({ hotelId: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
