require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const { verifyToken, allowRoles } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Registration Service: MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// API 1: health check
app.get('/register/health', (req, res) => {
  res.json({ service: 'registration-service', status: 'UP', port: PORT });
});

// API 2: register a new user (ADMIN or VOLUNTEER)
app.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, adminCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'password must be at least 6 characters' });
    }

    const userRole = (role || 'VOLUNTEER').toUpperCase();
    if (!['ADMIN', 'VOLUNTEER'].includes(userRole)) {
      return res.status(400).json({ message: 'role must be ADMIN or VOLUNTEER' });
    }
    // Admin accounts need a secret registration code
    if (userRole === 'ADMIN' && adminCode !== process.env.ADMIN_CODE) {
      return res.status(403).json({ message: 'Invalid admin registration code' });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role: userRole });

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// API 3: list all users (ADMIN only)
app.get('/register/users', verifyToken, allowRoles('ADMIN'), async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json({ count: users.length, users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Registration Service running on port ${PORT}`));
