const express = require('express');
const router = express.Router();
const { supabaseAdmin, supabase, isConfigured } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/notifications - List notifications and unread count
router.get('/', authenticate, async (req, res) => {
  try {
    if (!isConfigured) {
      return res.json({ notifications: [], unread_count: 0 });
    }

    const client = supabaseAdmin || supabase;
    const { data: notifications, error } = await client
      .from('notifications')
      .select('*, branches(name)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const unreadCount = (notifications || []).filter(n => !n.is_read).length;

    res.json({
      notifications: notifications || [],
      unread_count: unreadCount
    });
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// PUT /api/notifications/:id/read - Mark single as read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;

    const { data, error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ notification: data, message: 'Notification marked as read.' });
  } catch (err) {
    console.error('Error updating notification:', err.message);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// PUT /api/notifications/read-all - Mark all as read
router.put('/read-all', authenticate, async (req, res) => {
  try {
    const client = supabaseAdmin || supabase;

    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    if (error) throw error;
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Error marking all notifications read:', err.message);
    res.status(500).json({ error: 'Failed to mark all as read.' });
  }
});

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;

    const { error } = await client
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ message: 'Notification deleted successfully.' });
  } catch (err) {
    console.error('Error deleting notification:', err.message);
    res.status(500).json({ error: 'Failed to delete notification.' });
  }
});

module.exports = router;
