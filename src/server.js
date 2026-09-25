require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const taskRoutes = require('./routes/tasks');
const notificationRoutes = require('./routes/notifications');
const pushRoutes = require('./routes/push');
const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin : '*' }))
app.use(express.json({ limit: '1mb' }));

// Phuc vu giao dien (index.html) tu chinh server nay: cung ten mien nen khong loi CORS
const INDEX_FILE = path.join(__dirname, '..', 'index.html');
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'workline-server' }));
app.get(['/', '/index.html'], (req, res) => res.sendFile(INDEX_FILE));
app.get('/sw.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'sw.js')));
app.get('/apple-touch-icon.png', (req, res) => res.sendFile(path.join(__dirname, '..', 'apple-touch-icon.png')));
app.get('/icon-192.png', (req, res) => res.sendFile(path.join(__dirname, '..', 'icon-192.png')));
app.get('/icon-512.png', (req, res) => res.sendFile(path.join(__dirname, '..', 'icon-512.png')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, '..', 'manifest.json')));
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'workline-server' });
});

app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushRoutes);
// Bat loi chung
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ nội bộ.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Workline server đang chạy tại http://localhost:${PORT}`);
});
