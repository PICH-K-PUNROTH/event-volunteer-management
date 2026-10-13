require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Event = require('./models/Event');
const { verifyToken, allowRoles } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Event Service: MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

const handleError = (res, err) => {
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id format' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  return res.status(500).json({ message: err.message });
};

// Health check (public)
app.get('/events/health', (req, res) => {
  res.json({ service: 'event-service', status: 'UP', port: PORT, instance: process.env.INSTANCE_NAME || 'default' });
});

// API 1: create event (ADMIN)
app.post('/events', verifyToken, allowRoles('ADMIN'), async (req, res) => {
  try {
    const { title, description, date, venueName, venueAddress, city, volunteersNeeded } = req.body;
    if (!title || !date || !venueName || !city) {
      return res.status(400).json({ message: 'title, date, venueName and city are required' });
    }
    const event = await Event.create({
      title,
      description,
      date,
      venueName,
      venueAddress,
      city,
      volunteersNeeded,
      createdBy: req.user.id,
    });
    res.status(201).json({ message: 'Event created', event });
  } catch (err) {
    handleError(res, err);
  }
});

// API 2: list events (ADMIN, VOLUNTEER) - optional ?status=UPCOMING
app.get('/events', verifyToken, allowRoles('ADMIN', 'VOLUNTEER'), async (req, res) => {
  try {
    const filter = req.query.status ? { status: String(req.query.status).toUpperCase() } : {};
    const events = await Event.find(filter).sort({ date: 1 });
    res.json({ count: events.length, events });
  } catch (err) {
    handleError(res, err);
  }
});

// API 3: get one event (ADMIN, VOLUNTEER)
app.get('/events/:id', verifyToken, allowRoles('ADMIN', 'VOLUNTEER'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (err) {
    handleError(res, err);
  }
});

// API 4: update event (ADMIN)
app.put('/events/:id', verifyToken, allowRoles('ADMIN'), async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event updated', event });
  } catch (err) {
    handleError(res, err);
  }
});

// API 5: delete event (ADMIN)
app.delete('/events/:id', verifyToken, allowRoles('ADMIN'), async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (err) {
    handleError(res, err);
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Event Service running on port ${PORT}`));
