const mongoose = require('mongoose');

// Collection: assignments  (database: evm_assignments)
const assignmentSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },     // _id of a document in event-service
    eventTitle: { type: String, default: '' },     // copied from event-service at assign time
    volunteerId: { type: String, required: true }, // user id of the volunteer
    task: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'COMPLETED'],
      default: 'PENDING',
    },
    hoursWorked: { type: Number, default: 0, min: 0 },
    assignedBy: { type: String, required: true },  // admin user id from the JWT
  },
  { timestamps: true }
);

// A volunteer can only be assigned once per event
assignmentSchema.index({ eventId: 1, volunteerId: 1 }, { unique: true });

module.exports = mongoose.model('Assignment', assignmentSchema, 'assignments');
