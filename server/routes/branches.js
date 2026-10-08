const express = require('express');
const router = express.Router();
const { supabaseAdmin, supabase, isConfigured } = require('../config/supabase');
const { authenticate, requireOwner } = require('../middleware/auth');

// GET /api/branches - List all branches for authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    if (!isConfigured) {
      return res.json({ branches: [], message: 'Supabase credentials not configured' });
    }

    const client = supabaseAdmin || supabase;
    const userId = req.user.id;
    const userEmail = req.user.email;
    const userRole = (req.user.user_metadata?.role || req.user.role || 'owner').toLowerCase();

    // Fetch branches: If manager, fetch assigned branch; if owner, fetch all owned branches
    let branches = [];
    if (userRole === 'manager') {
      let bRes = await client.from('branches').select('*').or(`manager_id.eq.${userId},manager_email.eq.${userEmail}`).order('created_at', { ascending: false });
      if (bRes.error) {
        // Fallback to query by manager_email if manager_id column is not yet migrated in Supabase
        bRes = await client.from('branches').select('*').eq('manager_email', userEmail).order('created_at', { ascending: false });
      }
      if (bRes.error) throw bRes.error;
      branches = bRes.data || [];
    } else {
      const { data, error } = await client.from('branches').select('*').eq('owner_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      branches = data || [];
    }

    // Enhance each branch with current month revenue, today's revenue, inventory health
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    const branchList = await Promise.all(branches.map(async (branch) => {
      // Sales in current month
      const { data: monthSales } = await client
        .from('sales')
        .select('net_sales, sale_date')
        .eq('branch_id', branch.id)
        .gte('sale_date', currentMonthStart);

      const monthlyRevenue = (monthSales || []).reduce((sum, s) => sum + Number(s.net_sales || 0), 0);
      const todaySale = (monthSales || []).find(s => s.sale_date === todayStr);
      const todayRevenue = todaySale ? Number(todaySale.net_sales || 0) : 0;

      // Target completion
      const target = Number(branch.monthly_target || 0);
      const targetCompletion = target > 0 ? Math.min(Math.round((monthlyRevenue / target) * 100), 200) : 0;

      // Inventory health
      const { data: inv } = await client
        .from('inventory')
        .select('current_quantity, minimum_quantity')
        .eq('branch_id', branch.id);

      let invPercentage = 100;
      let hasOutOfStock = false;
      let hasLowStock = false;

      if (inv && inv.length > 0) {
        const totalReq = inv.reduce((s, i) => s + (Number(i.minimum_quantity) || 1), 0);
        const totalCurr = inv.reduce((s, i) => s + Number(i.current_quantity || 0), 0);
        invPercentage = totalReq > 0 ? Math.min(Math.round((totalCurr / totalReq) * 100), 100) : 100;

        hasOutOfStock = inv.some(i => Number(i.current_quantity) === 0);
        hasLowStock = inv.some(i => Number(i.current_quantity) <= Number(i.minimum_quantity));
      }

      // Dynamic branch status logic if target completion is poor or out of stock
      let calculatedStatus = branch.status || 'Active';
      const dayOfMonth = now.getDate();
      const expectedPacing = Math.round((dayOfMonth / 30) * 100);

      if (hasOutOfStock) {
        calculatedStatus = 'Out of Stock';
      } else if (target > 0 && targetCompletion < (expectedPacing * 0.6) && dayOfMonth > 7) {
        calculatedStatus = 'Under-performing';
      } else if (branch.status !== 'Inactive') {
        calculatedStatus = 'Active';
      }

      return {
        ...branch,
        today_revenue: todayRevenue,
        monthly_revenue: monthlyRevenue,
        target_completion: targetCompletion,
        inventory_percentage: invPercentage,
        status: calculatedStatus
      };
    }));

    res.json({ branches: branchList });
  } catch (err) {
    console.error('Error fetching branches:', err.message);
    res.status(500).json({ error: 'Failed to retrieve branches.' });
  }
});

// GET /api/branches/:id - Get single branch details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;

    const { data: branch, error: bError } = await client
      .from('branches')
      .select('*')
      .eq('id', id)
      .single();

    if (bError || !branch) {
      return res.status(404).json({ error: 'Branch not found.' });
    }

    // Verify ownership or manager access
    if (branch.owner_id !== req.user.id && branch.manager_email !== req.user.email) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Calculate details
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    // Today's & monthly sales
    const { data: sales } = await client
      .from('sales')
      .select('*')
      .eq('branch_id', id)
      .order('sale_date', { ascending: false });

    const monthlySales = (sales || [])
      .filter(s => s.sale_date >= currentMonthStart)
      .reduce((sum, s) => sum + Number(s.net_sales || 0), 0);

    const todaySaleObj = (sales || []).find(s => s.sale_date === todayStr);
    const todaySales = todaySaleObj ? Number(todaySaleObj.net_sales || 0) : 0;

    // Monthly expenses
    const { data: expenses } = await client
      .from('expenses')
      .select('*')
      .eq('branch_id', id)
      .order('expense_date', { ascending: false });

    const monthlyExpenses = (expenses || [])
      .filter(e => e.expense_date >= currentMonthStart)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Target completion
    const target = Number(branch.monthly_target || 0);
    const targetCompletion = target > 0 ? Math.min(Math.round((monthlySales / target) * 100), 200) : 0;

    // Inventory
    const { data: inventory } = await client
      .from('inventory')
      .select('*')
      .eq('branch_id', id)
      .order('item_name', { ascending: true });

    let invPercentage = 100;
    if (inventory && inventory.length > 0) {
      const totalReq = inventory.reduce((s, i) => s + (Number(i.minimum_quantity) || 1), 0);
      const totalCurr = inventory.reduce((s, i) => s + Number(i.current_quantity || 0), 0);
      invPercentage = totalReq > 0 ? Math.min(Math.round((totalCurr / totalReq) * 100), 100) : 100;
    }

    // Recent reports
    const { data: reports } = await client
      .from('daily_reports')
      .select('*')
      .eq('branch_id', id)
      .order('report_date', { ascending: false })
      .limit(7);

    res.json({
      branch,
      kpis: {
        today_sales: todaySales,
        monthly_sales: monthlySales,
        monthly_target: target,
        target_completion: targetCompletion,
        inventory_status: invPercentage,
        total_expenses: monthlyExpenses
      },
      recent_sales: (sales || []).slice(0, 14),
      recent_expenses: (expenses || []).slice(0, 10),
      inventory: inventory || [],
      recent_reports: reports || []
    });
  } catch (err) {
    console.error('Error fetching branch details:', err.message);
    res.status(500).json({ error: 'Failed to retrieve branch details.' });
  }
});

// POST /api/branches - Create new branch
router.post('/', authenticate, requireOwner, async (req, res) => {
  try {
    const {
      name, code, address, city, state,
      manager_id, manager_name, manager_email, manager_phone,
      monthly_target, opening_date, status
    } = req.body;

    if (!name || !code || !city || !state) {
      return res.status(400).json({ error: 'Name, code, city, and state are required.' });
    }

    const client = supabaseAdmin || supabase;

    // Build branch insert object
    const insertPayload = {
      owner_id: req.user.id,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      address: address?.trim() || null,
      city: city.trim(),
      state: state.trim(),
      manager_id: manager_id || null,
      manager_name: manager_name?.trim() || null,
      manager_email: manager_email?.trim() || null,
      manager_phone: manager_phone?.trim() || null,
      monthly_target: Number(monthly_target) || 0,
      opening_date: opening_date || new Date().toISOString().split('T')[0],
      status: status || 'Active'
    };

    let data, error;
    try {
      const res = await client
        .from('branches')
        .insert(insertPayload)
        .select()
        .single();
      data = res.data;
      error = res.error;
    } catch (e) {
      // If manager_id column does not exist yet in DB, retry without manager_id column
      delete insertPayload.manager_id;
      const res = await client
        .from('branches')
        .insert(insertPayload)
        .select()
        .single();
      data = res.data;
      error = res.error;
    }

    if (error) {
      // Also catch PGRST204 if column manager_id is missing
      if (error.code === 'PGRST204' || (error.message && error.message.includes('manager_id'))) {
        delete insertPayload.manager_id;
        const retryRes = await client
          .from('branches')
          .insert(insertPayload)
          .select()
          .single();
        if (retryRes.error) throw retryRes.error;
        data = retryRes.data;
      } else if (error.code === '23505') {
        return res.status(409).json({ error: 'A branch with this code already exists.' });
      } else {
        throw error;
      }
    }

    res.status(201).json({ branch: data, message: 'Branch created successfully.' });
  } catch (err) {
    console.error('Error creating branch:', err.message);
    res.status(500).json({ error: 'Failed to create branch.' });
  }
});

// PUT /api/branches/:id - Update branch
router.put('/:id', authenticate, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, code, address, city, state,
      manager_id, manager_name, manager_email, manager_phone,
      monthly_target, opening_date, status
    } = req.body;

    const client = supabaseAdmin || supabase;
    const updatePayload = {
      name: name?.trim(),
      code: code ? code.trim().toUpperCase() : undefined,
      address: address?.trim(),
      city: city?.trim(),
      state: state?.trim(),
      manager_id: manager_id !== undefined ? (manager_id || null) : undefined,
      manager_name: manager_name?.trim(),
      manager_email: manager_email?.trim(),
      manager_phone: manager_phone?.trim(),
      monthly_target: monthly_target !== undefined ? Number(monthly_target) : undefined,
      opening_date: opening_date || undefined,
      status: status || undefined
    };

    let data, error;
    try {
      const res = await client
        .from('branches')
        .update(updatePayload)
        .eq('id', id)
        .eq('owner_id', req.user.id)
        .select()
        .single();
      data = res.data;
      error = res.error;
    } catch (e) {
      delete updatePayload.manager_id;
      const res = await client
        .from('branches')
        .update(updatePayload)
        .eq('id', id)
        .eq('owner_id', req.user.id)
        .select()
        .single();
      data = res.data;
      error = res.error;
    }

    if (error) {
      if (error.code === 'PGRST204' || (error.message && error.message.includes('manager_id'))) {
        delete updatePayload.manager_id;
        const retryRes = await client
          .from('branches')
          .update(updatePayload)
          .eq('id', id)
          .eq('owner_id', req.user.id)
          .select()
          .single();
        if (retryRes.error) throw retryRes.error;
        data = retryRes.data;
      } else {
        throw error;
      }
    }

    res.json({ branch: data, message: 'Branch updated successfully.' });
  } catch (err) {
    console.error('Error updating branch:', err.message);
    res.status(500).json({ error: 'Failed to update branch.' });
  }
});

// DELETE /api/branches/:id - Delete branch
router.delete('/:id', authenticate, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;

    const { error } = await client
      .from('branches')
      .delete()
      .eq('id', id)
      .eq('owner_id', req.user.id);

    if (error) throw error;
    res.json({ message: 'Branch deleted successfully.' });
  } catch (err) {
    console.error('Error deleting branch:', err.message);
    res.status(500).json({ error: 'Failed to delete branch.' });
  }
});

module.exports = router;
