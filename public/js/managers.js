/**
 * OwnerDesk - Managers Controller (Admin / Owner Panel)
 * Handles independent manager creation, status toggles (Disable/Reactivate), and deletion.
 */

let allManagers = [];

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  // Ensure current user is an Owner / Admin
  const userStr = localStorage.getItem('ownerdesk_user');
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      if (u.role && u.role.toLowerCase() !== 'owner') {
        UI.showToast('Access restricted: Only restaurant chain owners can manage managers.', 'danger');
        setTimeout(() => window.location.href = '/dashboard.html', 1200);
        return;
      }
    } catch (e) {}
  }

  UI.initSidebar('managers');
  setupManagersEventListeners();
  loadManagers();
});

async function loadManagers() {
  const tbody = document.getElementById('managersTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4">
          <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
          Loading branch managers...
        </td>
      </tr>
    `;
  }

  try {
    const res = await apiRequest('/api/managers');
    allManagers = res.managers || [];
    renderManagers(allManagers);
  } catch (err) {
    console.error('Failed to load managers:', err);
    UI.showToast('Could not load managers: ' + err.message, 'danger');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-danger">
            Failed to load managers. Please try again.
          </td>
        </tr>
      `;
    }
  }
}

function renderManagers(managers) {
  const tbody = document.getElementById('managersTableBody');
  const countBadge = document.getElementById('managersCountBadge');
  const activeCountEl = document.getElementById('kpiActiveManagersCount');
  const disabledCountEl = document.getElementById('kpiDisabledManagersCount');
  const totalCountEl = document.getElementById('kpiTotalManagersCount');

  const activeCount = managers.filter(m => m.status === 'Active').length;
  const disabledCount = managers.filter(m => m.status === 'Disabled').length;

  if (countBadge) countBadge.textContent = `${managers.length} Managers`;
  if (totalCountEl) totalCountEl.textContent = managers.length;
  if (activeCountEl) activeCountEl.textContent = activeCount;
  if (disabledCountEl) disabledCountEl.textContent = disabledCount;

  if (!tbody) return;

  if (managers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <i class="bi bi-person-badge empty-state-icon"></i>
            <div class="empty-state-title">No branch managers created yet</div>
            <div class="empty-state-description">
              Create branch managers independently here. You can then assign them to outlets when creating branches.
            </div>
            <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createManagerModal" onclick="prepareCreateManagerModal()">
              <i class="bi bi-person-plus me-1"></i> Create Manager
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const html = managers.map(m => {
    const isActive = m.status === 'Active';
    const statusBadgeClass = isActive ? 'badge-active' : 'badge-out-of-stock';
    const assignedBranchText = m.assigned_branch 
      ? `<span class="badge bg-light text-dark border"><i class="bi bi-shop me-1 text-primary"></i>${m.assigned_branch.name}</span>`
      : `<span class="text-muted small">Unassigned</span>`;

    return `
      <tr>
        <td>
          <span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-semibold px-2 py-1">
            ${m.manager_id_code}
          </span>
        </td>
        <td>
          <div class="fw-semibold text-dark">${m.name}</div>
          <div class="small text-muted">Created: ${UI.formatDate(m.created_at)}</div>
        </td>
        <td>
          <div class="text-dark"><i class="bi bi-telephone text-muted me-1 small"></i>${m.mobile}</div>
        </td>
        <td>
          <div class="text-dark"><i class="bi bi-envelope text-muted me-1 small"></i>${m.email}</div>
        </td>
        <td>
          ${assignedBranchText}
        </td>
        <td>
          <span class="status-badge ${statusBadgeClass}">
            <i class="bi ${isActive ? 'bi-check-circle' : 'bi-slash-circle'}"></i>
            ${m.status}
          </span>
        </td>
        <td class="text-end">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-secondary" onclick="openResetPasswordModal('${m.id}', '${m.name}', '${m.manager_id_code}')" title="Reset Password">
              <i class="bi bi-key text-primary me-1"></i> Password
            </button>
            ${isActive ? `
              <button class="btn btn-sm btn-outline-secondary" onclick="confirmDisableManager('${m.id}', '${m.name}')" title="Disable Manager">
                <i class="bi bi-pause-circle text-warning me-1"></i> Disable
              </button>
            ` : `
              <button class="btn btn-sm btn-outline-secondary" onclick="confirmReactivateManager('${m.id}', '${m.name}')" title="Reactivate Manager">
                <i class="bi bi-play-circle text-success me-1"></i> Reactivate
              </button>
            `}
            <button class="btn btn-sm btn-outline-secondary text-danger" onclick="confirmDeleteManager('${m.id}', '${m.name}')" title="Delete Manager Permanently">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

function setupManagersEventListeners() {
  // Search and filter
  const searchInput = document.getElementById('managerSearchInput');
  const statusFilter = document.getElementById('managerStatusFilter');

  function applyFilters() {
    const q = (searchInput?.value || '').toLowerCase().trim();
    const st = statusFilter?.value || 'all';

    const filtered = allManagers.filter(m => {
      const matchesSearch = !q ||
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.manager_id_code.toLowerCase().includes(q) ||
        m.mobile.toLowerCase().includes(q);

      const matchesStatus = (st === 'all') || (m.status === st);
      return matchesSearch && matchesStatus;
    });

    renderManagers(filtered);
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (statusFilter) statusFilter.addEventListener('change', applyFilters);

  // Form submission
  const form = document.getElementById('createManagerForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleCreateManager();
    });
  }
}

function prepareCreateManagerModal() {
  const form = document.getElementById('createManagerForm');
  if (form) form.reset();
}

async function handleCreateManager() {
  const submitBtn = document.getElementById('saveManagerBtn');

  const payload = {
    manager_id_code: document.getElementById('mgrIdCode').value.trim(),
    password: document.getElementById('mgrPassword').value,
    mobile: document.getElementById('mgrMobile').value.trim(),
    name: document.getElementById('mgrName').value.trim(),
    email: document.getElementById('mgrEmail').value.trim()
  };

  if (!payload.manager_id_code || !payload.password || !payload.mobile || !payload.name || !payload.email) {
    UI.showToast('Please fill all required fields.', 'warning');
    return;
  }

  if (payload.password.length < 6) {
    UI.showToast('Password must be at least 6 characters.', 'warning');
    return;
  }

  UI.setButtonLoading(submitBtn, true, '', 'Creating Manager...');

  try {
    await apiRequest('/api/managers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    UI.showToast(`Manager ${payload.name} created successfully. No email verification required.`, 'success');

    const modalEl = document.getElementById('createManagerModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    await loadManagers();
  } catch (err) {
    console.error('Create manager error:', err);
    UI.showToast(err.message || 'Failed to create manager.', 'danger');
  } finally {
    UI.setButtonLoading(submitBtn, false);
  }
}

function confirmDisableManager(id, name) {
  UI.showConfirmModal({
    title: 'Disable Manager Account',
    message: `Are you sure you want to disable ${name}? The manager will be locked out and cannot log in until reactivated. Their record will remain in your list.`,
    confirmBtnText: 'Disable Manager',
    isDanger: true,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/managers/${id}/disable`, { method: 'PUT' });
        UI.showToast(`${name} has been disabled.`, 'warning');
        await loadManagers();
      } catch (err) {
        UI.showToast(err.message || 'Failed to disable manager.', 'danger');
      }
    }
  });
}

function confirmReactivateManager(id, name) {
  UI.showConfirmModal({
    title: 'Reactivate Manager Account',
    message: `Are you sure you want to reactivate ${name}? They will immediately be able to log in and manage their branch operations again.`,
    confirmBtnText: 'Reactivate Manager',
    isDanger: false,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/managers/${id}/reactivate`, { method: 'PUT' });
        UI.showToast(`${name} has been reactivated.`, 'success');
        await loadManagers();
      } catch (err) {
        UI.showToast(err.message || 'Failed to reactivate manager.', 'danger');
      }
    }
  });
}

function confirmDeleteManager(id, name) {
  UI.showConfirmModal({
    title: 'Delete Manager Account',
    message: `Are you sure you want to permanently delete manager ${name}? This account will be removed permanently from your console. This action cannot be undone.`,
    confirmBtnText: 'Delete Manager',
    isDanger: true,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/managers/${id}`, { method: 'DELETE' });
        UI.showToast(`${name} permanently deleted.`, 'success');
        await loadManagers();
      } catch (err) {
        UI.showToast(err.message || 'Failed to delete manager.', 'danger');
      }
    }
  });
}

function openResetPasswordModal(id, name, managerCode) {
  const modalEl = document.getElementById('resetPasswordModal');
  if (!modalEl) return;

  document.getElementById('resetManagerId').value = id;
  const subtitle = document.getElementById('resetModalSubtitle');
  if (subtitle) {
    subtitle.textContent = `Set new login password for ${name} (${managerCode}).`;
  }
  document.getElementById('newMgrPassword').value = '';

  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
}

// Attach reset password form submit listener
document.addEventListener('DOMContentLoaded', () => {
  const resetForm = document.getElementById('resetPasswordForm');
  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('resetManagerId').value;
      const newPassword = document.getElementById('newMgrPassword').value;
      const saveBtn = document.getElementById('saveResetPasswordBtn');

      if (!newPassword || newPassword.length < 6) {
        UI.showToast('Password must be at least 6 characters long.', 'warning');
        return;
      }

      UI.setButtonLoading(saveBtn, true, '', 'Updating...');

      try {
        await apiRequest(`/api/managers/${id}/reset-password`, {
          method: 'PUT',
          body: JSON.stringify({ new_password: newPassword })
        });

        UI.showToast('Manager password updated successfully.', 'success');

        const modalEl = document.getElementById('resetPasswordModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      } catch (err) {
        console.error('Password reset error:', err);
        UI.showToast(err.message || 'Failed to update manager password.', 'danger');
      } finally {
        UI.setButtonLoading(saveBtn, false);
      }
    });
  }
});
