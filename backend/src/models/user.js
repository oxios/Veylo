const mongoose = require("mongoose");
const schemaOptions = require("../utils/schema-options");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["owner"], default: "owner" },
  lastLoginAt: { type: Date, default: null },
}, schemaOptions);

module.exports = mongoose.model("User", userSchema);
