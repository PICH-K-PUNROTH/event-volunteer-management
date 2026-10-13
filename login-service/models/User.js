const mongoose = require('mongoose');

// Collection: users  (database: evm_auth) - same collection written by registration-service
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
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['ADMIN', 'VOLUNTEER'],
      default: 'VOLUNTEER',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema, 'users');
