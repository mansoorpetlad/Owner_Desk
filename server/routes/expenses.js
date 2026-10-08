const express = require('express');
const router = express.Router();
const { supabaseAdmin, supabase, isConfigured } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/expenses - List expenses with filters
router.get('/', authenticate, async (req, res) => {
  try {
    if (!isConfigured) return res.json({ expenses: [], breakdown: {} });

    const client = supabaseAdmin || supabase;
    const { branch_id, category, start_date, end_date } = req.query;
    const userRole = (req.user.user_metadata?.role || req.user.role || 'owner').toLowerCase();

    let userBranches = [];
    if (userRole === 'manager') {
      let bRes = await client.from('branches').select('id, name').or(`manager_id.eq.${req.user.id},manager_email.eq.${req.user.email}`);
      if (bRes.error) {
        bRes = await client.from('branches').select('id, name').eq('manager_email', req.user.email);
      }
      userBranches = bRes.data || [];
    } else {
      const { data } = await client.from('branches').select('id, name').eq('owner_id', req.user.id);
      userBranches = data || [];
    }
    const branchIds = (userBranches || []).map(b => b.id);
    if (branchIds.length === 0) return res.json({ expenses: [], breakdown: {} });

    let query = client
      .from('expenses')
      .select('*, branches(name, code)')
      .in('branch_id', branchIds)
      .order('expense_date', { ascending: false });

    if (branch_id && branch_id !== 'all' && branchIds.includes(branch_id)) {
      query = query.eq('branch_id', branch_id);
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (start_date) {
      query = query.gte('expense_date', start_date);
    }
    if (end_date) {
      query = query.lte('expense_date', end_date);
    }

    const { data: expenses, error } = await query;
    if (error) throw error;

    // Calculate category breakdown
    const categoryTotals = {};
    let totalAmount = 0;

    (expenses || []).forEach(exp => {
      const amt = Number(exp.amount) || 0;
      totalAmount += amt;
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + amt;
    });

    res.json({
      expenses: expenses || [],
      total_amount: totalAmount,
      category_breakdown: categoryTotals
    });
  } catch (err) {
    console.error('Error fetching expenses:', err.message);
    res.status(500).json({ error: 'Failed to retrieve expenses.' });
  }
});

// POST /api/expenses - Add new expense
router.post('/', authenticate, async (req, res) => {
  try {
    const { branch_id, expense_date, category, amount, description, payment_method, notes } = req.body;

    if (!branch_id || !expense_date || !category || !amount) {
      return res.status(400).json({ error: 'Branch, date, category, and amount are required.' });
    }

    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('expenses')
      .insert({
        branch_id,
        created_by: req.user.id,
        expense_date,
        category,
        amount: Number(amount) || 0,
        description: description?.trim() || null,
        payment_method: payment_method || 'UPI',
        notes: notes?.trim() || null
      })
      .select('*, branches(name)')
      .single();

    if (error) throw error;
    res.status(201).json({ expense: data, message: 'Expense recorded successfully.' });
  } catch (err) {
    console.error('Error adding expense:', err.message);
    res.status(500).json({ error: 'Failed to record expense.' });
  }
});

// PUT /api/expenses/:id - Update expense
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { expense_date, category, amount, description, payment_method, notes } = req.body;

    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('expenses')
      .update({
        expense_date: expense_date || undefined,
        category: category || undefined,
        amount: amount !== undefined ? Number(amount) : undefined,
        description: description?.trim(),
        payment_method: payment_method || undefined,
        notes: notes?.trim()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ expense: data, message: 'Expense updated successfully.' });
  } catch (err) {
    console.error('Error updating expense:', err.message);
    res.status(500).json({ error: 'Failed to update expense.' });
  }
});

// DELETE /api/expenses/:id - Delete expense
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;

    const { error } = await client
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Expense deleted successfully.' });
  } catch (err) {
    console.error('Error deleting expense:', err.message);
    res.status(500).json({ error: 'Failed to delete expense.' });
  }
});

module.exports = router;
