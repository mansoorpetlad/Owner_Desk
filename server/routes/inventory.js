const express = require('express');
const router = express.Router();
const { supabaseAdmin, supabase, isConfigured } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { runOperationalAlertAudit } = require('../services/alertService');

// GET /api/inventory - List inventory items with stock status
router.get('/', authenticate, async (req, res) => {
  try {
    if (!isConfigured) return res.json({ inventory: [], summary: {} });

    const client = supabaseAdmin || supabase;
    const { branch_id, status, search, category } = req.query;
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
    if (branchIds.length === 0) return res.json({ inventory: [], summary: {} });

    let query = client
      .from('inventory')
      .select('*, branches(name, code)')
      .in('branch_id', branchIds)
      .order('item_name', { ascending: true });

    if (branch_id && branch_id !== 'all' && branchIds.includes(branch_id)) {
      query = query.eq('branch_id', branch_id);
    }
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data: items, error } = await query;
    if (error) throw error;

    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    let list = (items || []).map(item => {
      const curr = Number(item.current_quantity) || 0;
      const min = Number(item.minimum_quantity) || 0;

      let itemStatus = 'In Stock';
      if (curr === 0) {
        itemStatus = 'Out of Stock';
        outOfStockCount++;
      } else if (curr <= min) {
        itemStatus = 'Low Stock';
        lowStockCount++;
      } else {
        inStockCount++;
      }

      const stockProgress = min > 0 ? Math.min(Math.round((curr / min) * 100), 100) : 100;

      return {
        ...item,
        status: itemStatus,
        stock_progress: stockProgress
      };
    });

    if (status && status !== 'all') {
      list = list.filter(i => i.status.toLowerCase() === status.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.item_name.toLowerCase().includes(q) ||
        (i.category && i.category.toLowerCase().includes(q)) ||
        (i.supplier && i.supplier.toLowerCase().includes(q))
      );
    }

    res.json({
      inventory: list,
      summary: {
        total_items: items.length,
        in_stock: inStockCount,
        low_stock: lowStockCount,
        out_of_stock: outOfStockCount
      }
    });
  } catch (err) {
    console.error('Error fetching inventory:', err.message);
    res.status(500).json({ error: 'Failed to retrieve inventory items.' });
  }
});

// POST /api/inventory - Add inventory item
router.post('/', authenticate, async (req, res) => {
  try {
    const { branch_id, item_name, category, current_quantity, unit, minimum_quantity, cost_per_unit, supplier } = req.body;

    if (!branch_id || !item_name || !unit) {
      return res.status(400).json({ error: 'Branch, item name, and unit are required.' });
    }

    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('inventory')
      .insert({
        branch_id,
        item_name: item_name.trim(),
        category: category?.trim() || 'General Supplies',
        current_quantity: Number(current_quantity) || 0,
        unit: unit.trim(),
        minimum_quantity: Number(minimum_quantity) || 0,
        cost_per_unit: Number(cost_per_unit) || 0,
        supplier: supplier?.trim() || null
      })
      .select('*, branches(name)')
      .single();

    if (error) throw error;

    // Run alert check
    runOperationalAlertAudit(req.user.id);

    res.status(201).json({ item: data, message: 'Inventory item added successfully.' });
  } catch (err) {
    console.error('Error adding inventory item:', err.message);
    res.status(500).json({ error: 'Failed to add inventory item.' });
  }
});

// PUT /api/inventory/:id - Update inventory item
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { item_name, category, current_quantity, unit, minimum_quantity, cost_per_unit, supplier } = req.body;

    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('inventory')
      .update({
        item_name: item_name?.trim(),
        category: category?.trim(),
        current_quantity: current_quantity !== undefined ? Number(current_quantity) : undefined,
        unit: unit?.trim(),
        minimum_quantity: minimum_quantity !== undefined ? Number(minimum_quantity) : undefined,
        cost_per_unit: cost_per_unit !== undefined ? Number(cost_per_unit) : undefined,
        supplier: supplier?.trim()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Run alert check
    runOperationalAlertAudit(req.user.id);

    res.json({ item: data, message: 'Inventory item updated successfully.' });
  } catch (err) {
    console.error('Error updating inventory item:', err.message);
    res.status(500).json({ error: 'Failed to update inventory item.' });
  }
});

// DELETE /api/inventory/:id - Delete inventory item
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;

    const { error } = await client
      .from('inventory')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Inventory item removed successfully.' });
  } catch (err) {
    console.error('Error deleting inventory item:', err.message);
    res.status(500).json({ error: 'Failed to delete inventory item.' });
  }
});

module.exports = router;
