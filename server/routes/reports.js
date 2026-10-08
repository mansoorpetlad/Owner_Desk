const express = require('express');
const router = express.Router();
const { supabaseAdmin, supabase, isConfigured } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/reports/summary - Aggregate reporting data
router.get('/summary', authenticate, async (req, res) => {
  try {
    if (!isConfigured) {
      return res.json({
        financials: { total_revenue: 0, total_expenses: 0, net_revenue: 0, profit_margin: 0 },
        branch_performance: [],
        category_breakdown: {},
        revenue_trend: []
      });
    }

    const client = supabaseAdmin || supabase;
    const { branch_id, start_date, end_date } = req.query;

    // Get branches
    const userRole = (req.user.user_metadata?.role || req.user.role || 'owner').toLowerCase();
    let userBranches = [];
    if (userRole === 'manager') {
      let bRes = await client.from('branches').select('*').or(`manager_id.eq.${req.user.id},manager_email.eq.${req.user.email}`);
      if (bRes.error) {
        bRes = await client.from('branches').select('*').eq('manager_email', req.user.email);
      }
      userBranches = bRes.data || [];
    } else {
      const { data } = await client.from('branches').select('*').eq('owner_id', req.user.id);
      userBranches = data || [];
    }

    const branchIds = (userBranches || []).map(b => b.id);
    if (branchIds.length === 0) {
      return res.json({
        financials: { total_revenue: 0, total_expenses: 0, net_revenue: 0, profit_margin: 0 },
        branch_performance: [],
        category_breakdown: {},
        revenue_trend: []
      });
    }

    const targetBranchIds = (branch_id && branch_id !== 'all' && branchIds.includes(branch_id)) ? [branch_id] : branchIds;

    // 1. Fetch Sales
    let salesQuery = client
      .from('sales')
      .select('*, branches(name)')
      .in('branch_id', targetBranchIds);

    if (start_date) salesQuery = salesQuery.gte('sale_date', start_date);
    if (end_date) salesQuery = salesQuery.lte('sale_date', end_date);

    const { data: sales, error: sErr } = await salesQuery;
    if (sErr) throw sErr;

    // 2. Fetch Expenses
    let expensesQuery = client
      .from('expenses')
      .select('*, branches(name)')
      .in('branch_id', targetBranchIds);

    if (start_date) expensesQuery = expensesQuery.gte('expense_date', start_date);
    if (end_date) expensesQuery = expensesQuery.lte('expense_date', end_date);

    const { data: expenses, error: eErr } = await expensesQuery;
    if (eErr) throw eErr;

    // Financial calculations
    const totalRevenue = (sales || []).reduce((sum, s) => sum + Number(s.net_sales || 0), 0);
    const totalOrders = (sales || []).reduce((sum, s) => sum + Number(s.total_orders || 0), 0);
    const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const netRevenue = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? Math.round((netRevenue / totalRevenue) * 100) : 0;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Category breakdown
    const categoryBreakdown = {};
    (expenses || []).forEach(e => {
      categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + Number(e.amount || 0);
    });

    // Branch performance analysis
    const branchPerformance = (userBranches || [])
      .filter(b => targetBranchIds.includes(b.id))
      .map(b => {
        const bSales = (sales || []).filter(s => s.branch_id === b.id);
        const bRev = bSales.reduce((sum, s) => sum + Number(s.net_sales || 0), 0);
        const bExp = (expenses || []).filter(e => e.branch_id === b.id).reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const bTarget = Number(b.monthly_target) || 0;
        const bComp = bTarget > 0 ? Math.round((bRev / bTarget) * 100) : 0;
        const bNet = bRev - bExp;

        return {
          id: b.id,
          name: b.name,
          code: b.code,
          city: b.city,
          revenue: bRev,
          expenses: bExp,
          net_revenue: bNet,
          monthly_target: bTarget,
          target_completion: bComp,
          status: b.status
        };
      });

    // Trend by date (sorted)
    const dateMap = {};
    (sales || []).forEach(s => {
      const d = s.sale_date;
      if (!dateMap[d]) dateMap[d] = { date: d, revenue: 0, expenses: 0 };
      dateMap[d].revenue += Number(s.net_sales || 0);
    });
    (expenses || []).forEach(e => {
      const d = e.expense_date;
      if (!dateMap[d]) dateMap[d] = { date: d, revenue: 0, expenses: 0 };
      dateMap[d].expenses += Number(e.amount || 0);
    });

    const trend = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      financials: {
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        avg_order_value: avgOrderValue,
        total_expenses: totalExpenses,
        net_revenue: netRevenue,
        profit_margin: profitMargin
      },
      branch_performance: branchPerformance,
      category_breakdown: categoryBreakdown,
      trend: trend
    });
  } catch (err) {
    console.error('Error generating report:', err.message);
    res.status(500).json({ error: 'Failed to generate financial report.' });
  }
});

module.exports = router;
