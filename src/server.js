require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'workline-server' });
});

app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);

// Bat loi chung
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Workline server đang chạy tại http://localhost:${PORT}`);
});
