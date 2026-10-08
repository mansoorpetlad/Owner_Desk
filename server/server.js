require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { supabaseUrl, supabaseAnonKey, isConfigured } = require('./config/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Public config endpoint - securely exposes only the public URL and anon key to frontend client
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: supabaseUrl || '',
    supabaseAnonKey: supabaseAnonKey || '',
    isConfigured: isConfigured
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'OwnerDesk — Centralized Multi-Outlet Restaurant Management Platform',
    version: '1.0.0',
    database_configured: isConfigured,
    timestamp: new Date().toISOString()
  });
});

// Mount API routes
app.use('/api/managers', require('./routes/managers'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error occurred.' });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  OwnerDesk Multi-Outlet Platform running on port ${PORT}`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`  Supabase Database: ${isConfigured ? 'Connected' : 'Pending configuration in .env'}`);
  console.log(`=======================================================`);
});
