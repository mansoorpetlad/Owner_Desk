const express = require('express');
const router = express.Router();
const { supabaseAdmin, supabase, isConfigured } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/sales - List sales with optional filters
router.get('/', authenticate, async (req, res) => {
  try {
    if (!isConfigured) return res.json({ sales: [] });

    const client = supabaseAdmin || supabase;
    const { branch_id, start_date, end_date } = req.query;
    const userRole = (req.user.user_metadata?.role || req.user.role || 'owner').toLowerCase();

    // Fetch user branches to verify authorization (Owner gets all, Manager gets assigned)
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
    if (branchIds.length === 0) return res.json({ sales: [] });

    let query = client
      .from('sales')
      .select('*, branches(name, code)')
      .in('branch_id', branchIds)
      .order('sale_date', { ascending: false });

    if (branch_id && branch_id !== 'all' && branchIds.includes(branch_id)) {
      query = query.eq('branch_id', branch_id);
    }
    if (start_date) {
      query = query.gte('sale_date', start_date);
    }
    if (end_date) {
      query = query.lte('sale_date', end_date);
    }

    const { data: sales, error } = await query;
    if (error) throw error;

    res.json({ sales: sales || [] });
  } catch (err) {
    console.error('Error fetching sales:', err.message);
    res.status(500).json({ error: 'Failed to retrieve sales records.' });
  }
});

// POST /api/sales - Submit daily sales
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      branch_id, sale_date, total_orders, gross_sales,
      discounts, tax, cash_amount, card_amount, upi_amount, notes
    } = req.body;

    if (!branch_id || !sale_date) {
      return res.status(400).json({ error: 'Branch and sale date are required.' });
    }

    const client = supabaseAdmin || supabase;

    // Duplicate check: prevent duplicate submissions for same branch & date
    const { data: existing } = await client
      .from('sales')
      .select('id')
      .eq('branch_id', branch_id)
      .eq('sale_date', sale_date)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: `A sales report for this branch on ${sale_date} already exists. Please edit the existing entry instead.`
      });
    }

    const gross = Number(gross_sales) || 0;
    const disc = Number(discounts) || 0;
    const tx = Number(tax) || 0;
    const net = gross - disc + tx;

    const { data, error } = await client
      .from('sales')
      .insert({
        branch_id,
        submitted_by: req.user.id,
        sale_date,
        total_orders: Number(total_orders) || 0,
        gross_sales: gross,
        discounts: disc,
        tax: tx,
        net_sales: net,
        cash_amount: Number(cash_amount) || 0,
        card_amount: Number(card_amount) || 0,
        upi_amount: Number(upi_amount) || 0,
        notes: notes?.trim() || null
      })
      .select('*, branches(name)')
      .single();

    if (error) throw error;

    res.status(201).json({ sale: data, message: 'Daily sales report submitted successfully.' });
  } catch (err) {
    console.error('Error submitting sales:', err.message);
    res.status(500).json({ error: 'Failed to submit sales report.' });
  }
});

// PUT /api/sales/:id - Update sales record
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      sale_date, total_orders, gross_sales,
      discounts, tax, cash_amount, card_amount, upi_amount, notes
    } = req.body;

    const client = supabaseAdmin || supabase;
    const gross = Number(gross_sales) || 0;
    const disc = Number(discounts) || 0;
    const tx = Number(tax) || 0;
    const net = gross - disc + tx;

    const { data, error } = await client
      .from('sales')
      .update({
        sale_date: sale_date || undefined,
        total_orders: total_orders !== undefined ? Number(total_orders) : undefined,
        gross_sales: gross,
        discounts: disc,
        tax: tx,
        net_sales: net,
        cash_amount: Number(cash_amount) || 0,
        card_amount: Number(card_amount) || 0,
        upi_amount: Number(upi_amount) || 0,
        notes: notes?.trim() || null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ sale: data, message: 'Sales record updated successfully.' });
  } catch (err) {
    console.error('Error updating sales:', err.message);
    res.status(500).json({ error: 'Failed to update sales record.' });
  }
});

// DELETE /api/sales/:id - Delete sales record
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;

    const { error } = await client
      .from('sales')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Sales record deleted successfully.' });
  } catch (err) {
    console.error('Error deleting sales:', err.message);
    res.status(500).json({ error: 'Failed to delete sales record.' });
  }
});

module.exports = router;
