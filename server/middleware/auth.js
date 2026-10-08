const { supabaseAdmin, supabase, isConfigured } = require('../config/supabase');

/**
 * Middleware to verify Supabase JWT token from Authorization header
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // If Supabase is not configured yet or in local demonstration mode
      if (!isConfigured) {
        req.user = { id: '00000000-0000-0000-0000-000000000001', role: 'owner', email: 'owner@ownerdesk.in' };
        return next();
      }
      return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    }

    const token = authHeader.split(' ')[1];
    const client = supabaseAdmin || supabase;
    const { data: { user }, error } = await client.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired session token.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication processing failed.' });
  }
}

/**
 * Middleware to ensure the user has the 'owner' role
 */
async function requireOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Check user metadata or profile role if available
  const role = req.user.user_metadata?.role || req.user.role || 'owner';
  if (role !== 'owner') {
    return res.status(403).json({ error: 'Access forbidden: Owner role required.' });
  }
  next();
}

module.exports = {
  authenticate,
  requireOwner
};
