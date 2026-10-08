const express = require('express');
const router = express.Router();
const { supabaseAdmin, supabase, isConfigured } = require('../config/supabase');
const { authenticate, requireOwner } = require('../middleware/auth');

/**
 * GET /api/managers/lookup-email
 * Resolves a Manager ID (e.g. "MGR-1") to the registered email address for login
 * Public endpoint called by login form before Supabase authentication
 */
router.get('/lookup-email', async (req, res) => {
  try {
    const { identifier } = req.query;
    if (!identifier) {
      return res.status(400).json({ error: 'Identifier is required.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    const client = supabaseAdmin || supabase;

    // 1. Check public.managers table
    try {
      const { data: mRows } = await client
        .from('managers')
        .select('email, manager_id_code, status');

      if (mRows && mRows.length > 0) {
        const found = mRows.find(m => (m.manager_id_code || '').trim().toLowerCase() === cleanId);
        if (found) {
          if (found.status === 'Disabled') {
            return res.status(403).json({ error: 'This manager account has been disabled by the owner.' });
          }
          return res.json({ email: found.email });
        }
      }
    } catch (e) {}

    // 2. Check Supabase Auth user list
    if (supabaseAdmin) {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      if (users) {
        const match = users.find(u => {
          const meta = u.user_metadata || {};
          const code = (meta.manager_id_code || meta.manager_code || '').trim().toLowerCase();
          return code === cleanId;
        });

        if (match) {
          if (match.user_metadata?.status === 'Disabled' || (match.banned_until && new Date(match.banned_until) > new Date())) {
            return res.status(403).json({ error: 'This manager account has been disabled by the owner.' });
          }
          return res.json({ email: match.email });
        }
      }
    }

    return res.status(404).json({ error: 'No manager found with this Manager ID.' });
  } catch (err) {
    console.error('Error looking up manager email:', err);
    res.status(500).json({ error: 'Identifier lookup failed.' });
  }
});

/**
 * Helper to fetch assigned branches for managers
 */
async function getManagerBranchMap(client, ownerId) {
  const map = {};
  try {
    let branches = null;
    const bRes = await client
      .from('branches')
      .select('id, name, code, manager_id, manager_email')
      .eq('owner_id', ownerId);
    if (bRes.error) {
      const fallback = await client
        .from('branches')
        .select('id, name, code, manager_email')
        .eq('owner_id', ownerId);
      branches = fallback.data;
    } else {
      branches = bRes.data;
    }

    if (branches) {
      branches.forEach(b => {
        if (b.manager_id) map[b.manager_id] = { id: b.id, name: b.name, code: b.code };
        if (b.manager_email) map[b.manager_email] = { id: b.id, name: b.name, code: b.code };
      });
    }
  } catch (e) {
    console.warn('Could not map branches to managers:', e.message);
  }
  return map;
}

// GET /api/managers - List all managers created by the owner
router.get('/', authenticate, requireOwner, async (req, res) => {
  try {
    const client = supabaseAdmin || supabase;
    const ownerId = req.user.id;
    const branchMap = await getManagerBranchMap(client, ownerId);

    // 1. Try querying the managers table
    let dbManagers = null;
    let tableExists = true;
    try {
      const { data, error } = await client
        .from('managers')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        dbManagers = data;
      } else if (error && error.code === 'PGRST205') {
        tableExists = false;
      }
    } catch (e) {
      tableExists = false;
    }

    if (dbManagers && dbManagers.length > 0) {
      const list = dbManagers.map(m => ({
        id: m.id,
        manager_id_code: m.manager_id_code,
        name: m.name,
        email: m.email,
        mobile: m.mobile,
        status: m.status || 'Active',
        auth_user_id: m.auth_user_id,
        assigned_branch: branchMap[m.id] || branchMap[m.email] || null,
        created_at: m.created_at
      }));
      return res.json({ managers: list });
    }

    // 2. Fallback / Sync from Supabase Auth admin user list
    let authManagers = [];
    if (supabaseAdmin) {
      const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers();
      if (!authErr && users) {
        authManagers = users
          .filter(u => {
            const meta = u.user_metadata || {};
            return meta.role === 'manager' && (meta.owner_id === ownerId || !meta.owner_id);
          })
          .map(u => {
            const meta = u.user_metadata || {};
            const isBanned = Boolean(u.banned_until && new Date(u.banned_until) > new Date());
            return {
              id: u.id,
              manager_id_code: meta.manager_id_code || meta.manager_code || 'MGR-' + u.id.slice(0, 4).toUpperCase(),
              name: meta.full_name || meta.name || u.email.split('@')[0],
              email: u.email,
              mobile: meta.mobile || meta.phone || '—',
              status: isBanned ? 'Disabled' : (meta.status || 'Active'),
              auth_user_id: u.id,
              assigned_branch: branchMap[u.id] || branchMap[u.email] || null,
              created_at: u.created_at
            };
          });
      }
    }

    res.json({ managers: authManagers });
  } catch (err) {
    console.error('Error fetching managers:', err);
    res.status(500).json({ error: 'Failed to retrieve managers.' });
  }
});

// POST /api/managers - Create a new manager
router.post('/', authenticate, requireOwner, async (req, res) => {
  try {
    const { manager_id_code, password, mobile, name, email } = req.body;

    if (!manager_id_code || !password || !mobile || !name || !email) {
      return res.status(400).json({
        error: 'All fields are required: Manager ID, Password, Mobile Number, Name, and Email.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const client = supabaseAdmin || supabase;
    const ownerId = req.user.id;
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = manager_id_code.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanMobile = mobile.trim();

    // 1. Create the Auth user in Supabase without email verification
    let authUser = null;
    if (supabaseAdmin) {
      const { data: createData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true, // No email verification required!
        user_metadata: {
          role: 'manager',
          full_name: cleanName,
          manager_id_code: cleanCode,
          mobile: cleanMobile,
          owner_id: ownerId,
          status: 'Active'
        }
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          return res.status(409).json({ error: 'A user with this email address already exists.' });
        }
        throw authError;
      }
      authUser = createData.user;
    }

    // 2. Insert into public.managers table if available
    let managerRecord = null;
    try {
      const { data: mData, error: mError } = await client
        .from('managers')
        .insert({
          owner_id: ownerId,
          manager_id_code: cleanCode,
          name: cleanName,
          email: cleanEmail,
          mobile: cleanMobile,
          status: 'Active',
          auth_user_id: authUser ? authUser.id : null
        })
        .select()
        .single();

      if (!mError) {
        managerRecord = mData;
      } else {
        console.warn('Could not insert to public.managers table:', mError.message);
      }
    } catch (e) {
      console.warn('Table managers insert skipped/error:', e.message);
    }

    res.status(201).json({
      manager: managerRecord || {
        id: authUser ? authUser.id : cleanCode,
        manager_id_code: cleanCode,
        name: cleanName,
        email: cleanEmail,
        mobile: cleanMobile,
        status: 'Active'
      },
      message: 'Manager created successfully. No email verification required.'
    });
  } catch (err) {
    console.error('Error creating manager:', err);
    res.status(500).json({ error: err.message || 'Failed to create manager.' });
  }
});

// PUT /api/managers/:id/disable - Disable a manager
router.put('/:id/disable', authenticate, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;
    const ownerId = req.user.id;

    // 1. Update in public.managers if table exists
    let authUserId = id;
    try {
      const { data: mRec } = await client
        .from('managers')
        .update({ status: 'Disabled' })
        .match({ id: id, owner_id: ownerId })
        .select()
        .maybeSingle();

      if (mRec && mRec.auth_user_id) {
        authUserId = mRec.auth_user_id;
      }
    } catch (e) {}

    // 2. Ban/disable in Supabase Auth so manager cannot log in
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          ban_duration: '876000h', // Effectively disables the account
          user_metadata: { status: 'Disabled' }
        });
      } catch (e) {
        console.warn('Auth ban notice:', e.message);
      }
    }

    res.json({ message: 'Manager disabled successfully. Account access suspended.' });
  } catch (err) {
    console.error('Error disabling manager:', err);
    res.status(500).json({ error: 'Failed to disable manager.' });
  }
});

// PUT /api/managers/:id/reactivate - Reactivate a manager
router.put('/:id/reactivate', authenticate, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;
    const ownerId = req.user.id;

    // 1. Update in public.managers if table exists
    let authUserId = id;
    try {
      const { data: mRec } = await client
        .from('managers')
        .update({ status: 'Active' })
        .match({ id: id, owner_id: ownerId })
        .select()
        .maybeSingle();

      if (mRec && mRec.auth_user_id) {
        authUserId = mRec.auth_user_id;
      }
    } catch (e) {}

    // 2. Unban/reactivate in Supabase Auth
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          ban_duration: 'none',
          user_metadata: { status: 'Active' }
        });
      } catch (e) {
        console.warn('Auth unban notice:', e.message);
      }
    }

    res.json({ message: 'Manager reactivated successfully. Account access restored.' });
  } catch (err) {
    console.error('Error reactivating manager:', err);
    res.status(500).json({ error: 'Failed to reactivate manager.' });
  }
});

// DELETE /api/managers/:id - Permanently delete a manager
router.delete('/:id', authenticate, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;
    const ownerId = req.user.id;

    let authUserId = id;

    // 1. Unassign from branches
    try {
      await client
        .from('branches')
        .update({ manager_id: null, manager_name: null, manager_email: null, manager_phone: null })
        .or(`manager_id.eq.${id}`);
    } catch (e) {}

    // 2. Delete from public.managers
    try {
      const { data: mRec } = await client
        .from('managers')
        .delete()
        .match({ id: id, owner_id: ownerId })
        .select()
        .maybeSingle();

      if (mRec && mRec.auth_user_id) {
        authUserId = mRec.auth_user_id;
      }
    } catch (e) {}

    // 3. Delete from Supabase Auth
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      } catch (e) {
        console.warn('Auth delete notice:', e.message);
      }
    }

    res.json({ message: 'Manager account permanently deleted.' });
  } catch (err) {
    console.error('Error deleting manager:', err);
    res.status(500).json({ error: 'Failed to delete manager.' });
  }
});

// PUT /api/managers/:id/reset-password - Owner sets new password for manager
router.put('/:id/reset-password', authenticate, requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const client = supabaseAdmin || supabase;
    const ownerId = req.user.id;
    let authUserId = id;

    // Check public.managers if available
    try {
      const { data: mRec } = await client
        .from('managers')
        .select('auth_user_id')
        .match({ id: id, owner_id: ownerId })
        .maybeSingle();

      if (mRec && mRec.auth_user_id) {
        authUserId = mRec.auth_user_id;
      }
    } catch (e) {}

    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: new_password
      });

      if (error) throw error;
    }

    res.json({ message: 'Manager password updated successfully.' });
  } catch (err) {
    console.error('Error resetting manager password:', err);
    res.status(500).json({ error: err.message || 'Failed to update manager password.' });
  }
});

module.exports = router;
