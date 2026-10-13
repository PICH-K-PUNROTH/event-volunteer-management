require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const Assignment = require('./models/Assignment');
const { verifyToken, allowRoles } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3006;

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Assignment Service: MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

const handleError = (res, err) => {
  if (err.code === 11000) return res.status(409).json({ message: 'Volunteer is already assigned to this event' });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id format' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  return res.status(500).json({ message: err.message });
};

// Health check (public)
app.get('/assignments/health', (req, res) => {
  res.json({ service: 'assignment-service', status: 'UP', port: PORT });
});

// API 1: ADMIN assigns a volunteer to an event
// Inter-service call: the event is verified in event-service before saving
app.post('/assignments', verifyToken, allowRoles('ADMIN'), async (req, res) => {
  try {
    const { eventId, volunteerId, task } = req.body;
    if (!eventId || !volunteerId || !task) {
      return res.status(400).json({ message: 'eventId, volunteerId and task are required' });
    }

    let event;
    try {
      const response = await axios.get(`${process.env.EVENT_SERVICE_URL}/events/${eventId}`, {
        headers: { Authorization: req.headers.authorization },
        timeout: 5000,
      });
      event = response.data;
    } catch (err) {
      if (err.response && (err.response.status === 404 || err.response.status === 400)) {
        return res.status(404).json({ message: 'Event not found in event-service' });
      }
      return res.status(502).json({ message: 'event-service is unreachable' });
    }

    const assignment = await Assignment.create({
      eventId,
      eventTitle: event.title,
      volunteerId,
      task,
      assignedBy: req.user.id,
    });
    res.status(201).json({ message: 'Volunteer assigned', assignment });
  } catch (err) {
    handleError(res, err);
  }
});

// API 2: ADMIN lists all assignments - optional ?eventId= or ?status=
app.get('/assignments', verifyToken, allowRoles('ADMIN'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.eventId) filter.eventId = String(req.query.eventId);
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    const assignments = await Assignment.find(filter).sort({ createdAt: -1 });
    res.json({ count: assignments.length, assignments });
  } catch (err) {
    handleError(res, err);
  }
});

// API 3: VOLUNTEER sees only their own assignments
app.get('/assignments/my', verifyToken, allowRoles('VOLUNTEER'), async (req, res) => {
  try {
    const assignments = await Assignment.find({ volunteerId: req.user.id }).sort({ createdAt: -1 });
    res.json({ count: assignments.length, assignments });
  } catch (err) {
    handleError(res, err);
  }
});

// API 4: VOLUNTEER accepts or declines their own assignment
app.patch('/assignments/:id/respond', verifyToken, allowRoles('VOLUNTEER'), async (req, res) => {
  try {
    const decision = String(req.body.decision || '').toUpperCase();
    if (!['ACCEPTED', 'DECLINED'].includes(decision)) {
      return res.status(400).json({ message: 'decision must be ACCEPTED or DECLINED' });
    }
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (assignment.volunteerId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: this assignment belongs to another volunteer' });
    }
    if (assignment.status !== 'PENDING') {
      return res.status(409).json({ message: `Assignment already ${assignment.status}` });
    }
    assignment.status = decision;
    await assignment.save();
    res.json({ message: `Assignment ${decision.toLowerCase()}`, assignment });
  } catch (err) {
    handleError(res, err);
  }
});

// API 5: ADMIN marks an accepted assignment as completed and records hours
app.patch('/assignments/:id/complete', verifyToken, allowRoles('ADMIN'), async (req, res) => {
  try {
    const hours = Number(req.body.hoursWorked);
    if (!Number.isFinite(hours) || hours < 0) {
      return res.status(400).json({ message: 'hoursWorked must be a positive number' });
    }
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (assignment.status !== 'ACCEPTED') {
      return res.status(409).json({ message: 'Only ACCEPTED assignments can be completed' });
    }
    assignment.status = 'COMPLETED';
    assignment.hoursWorked = hours;
    await assignment.save();
    res.json({ message: 'Assignment completed', assignment });
  } catch (err) {
    handleError(res, err);
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Assignment Service running on port ${PORT}`));
