require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const taskRoutes = require('./routes/tasks');
const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin : '*' }))
app.use(express.json());

// Phuc vu giao dien (index.html) tu chinh server nay: cung ten mien nen khong loi CORS
const INDEX_FILE = path.join(__dirname, '..', 'index.html');
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'workline-server' }));
app.get(['/', '/index.html'], (req, res) => res.sendFile(INDEX_FILE));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'workline-server' });
});

app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/tasks', taskRoutes);
// Bat loi chung
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Workline server đang chạy tại http://localhost:${PORT}`);
});
