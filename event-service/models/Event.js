const mongoose = require('mongoose');

// Collection: events  (database: evm_events)
const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    date: { type: Date, required: true },
    venueName: { type: String, required: true, trim: true },
    venueAddress: { type: String, default: '' },
    city: { type: String, required: true, trim: true },
    volunteersNeeded: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'],
      default: 'UPCOMING',
    },
    createdBy: { type: String, required: true }, // admin user id from the JWT
  },
  { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema, 'events');
