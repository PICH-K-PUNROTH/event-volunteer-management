const mongoose = require('mongoose');

// Collection: users  (database: evm_auth)
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true }, // bcrypt hash, never plain text
    role: {
      type: String,
      enum: ['ADMIN', 'VOLUNTEER'],
      default: 'VOLUNTEER',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema, 'users');
