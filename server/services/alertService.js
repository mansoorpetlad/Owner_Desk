const { supabaseAdmin, supabase, isConfigured } = require('../config/supabase');

/**
 * Audit inventory and branch targets to generate notifications
 */
async function runOperationalAlertAudit(userId) {
  if (!isConfigured) return;
  const client = supabaseAdmin || supabase;

  try {
    // 1. Fetch branches for this user
    const { data: branches, error: bError } = await client
      .from('branches')
      .select('id, name, monthly_target, owner_id')
      .eq('owner_id', userId);

    if (bError || !branches || branches.length === 0) return;

    const branchIds = branches.map(b => b.id);

    // 2. Fetch inventory for these branches
    const { data: inventoryItems, error: iError } = await client
      .from('inventory')
      .select('*')
      .in('branch_id', branchIds);

    if (!iError && inventoryItems) {
      for (const item of inventoryItems) {
        let title = '';
        let message = '';
        let type = '';
        let severity = 'info';

        const branch = branches.find(b => b.id === item.branch_id);
        const branchName = branch ? branch.name : 'Outlet';

        if (Number(item.current_quantity) === 0) {
          title = `Out of Stock: ${item.item_name}`;
          message = `${item.item_name} is completely out of stock at ${branchName}.`;
          type = 'Out of Stock';
          severity = 'critical';
        } else if (Number(item.current_quantity) <= Number(item.minimum_quantity)) {
          title = `Low Inventory: ${item.item_name}`;
          message = `${item.item_name} stock is low (${item.current_quantity} ${item.unit} remaining) at ${branchName}.`;
          type = 'Low Inventory';
          severity = 'warning';
        }

        if (title) {
          // Check if unread alert already exists
          const { data: existing } = await client
            .from('notifications')
            .select('id')
            .eq('user_id', userId)
            .eq('branch_id', item.branch_id)
            .eq('title', title)
            .eq('is_read', false);

          if (!existing || existing.length === 0) {
            await client.from('notifications').insert({
              user_id: userId,
              branch_id: item.branch_id,
              title,
              message,
              type,
              severity,
              is_read: false
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Error during operational alert audit:', err.message);
  }
}

module.exports = {
  runOperationalAlertAudit
};
