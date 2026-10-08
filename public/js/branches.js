let allBranches = [];
let createdManagers = [];
let currentUserRole = 'owner';

function getCurrentUserRole() {
  const userStr = localStorage.getItem('ownerdesk_user');
  if (userStr) {
    try { return (JSON.parse(userStr).role || 'owner').toLowerCase(); } catch (e) {}
  }
  return 'owner';
}

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  UI.initSidebar('branches');
  setupBranchEventListeners();

  currentUserRole = getCurrentUserRole();
  if (currentUserRole === 'manager') {
    const addBtn = document.querySelector('button[data-bs-target="#branchModal"]');
    if (addBtn) addBtn.style.display = 'none';
  }

  await loadCreatedManagers();
  loadBranches();
});

async function loadCreatedManagers() {
  try {
    const res = await apiRequest('/api/managers');
    createdManagers = res.managers || [];
  } catch (e) {
    console.warn('Could not load managers for branch selection:', e);
  }
}

function populateManagerDropdown(selectedManagerId = '', selectedManagerEmail = '') {
  const select = document.getElementById('branchManagerSelect');
  if (!select) return;

  if (createdManagers.length === 0) {
    select.innerHTML = `<option value="">-- No managers created yet (Unassigned) --</option>`;
    return;
  }

  let html = `<option value="">-- Unassigned (Assign Later) --</option>`;
  createdManagers.forEach(m => {
    const isSelected = (selectedManagerId && (m.id === selectedManagerId || m.auth_user_id === selectedManagerId)) ||
                       (selectedManagerEmail && m.email.toLowerCase() === selectedManagerEmail.toLowerCase());
    const disabledText = m.status === 'Disabled' ? ' (Disabled Account)' : '';
    html += `<option value="${m.id}" data-name="${m.name}" data-email="${m.email}" data-mobile="${m.mobile}" ${isSelected ? 'selected' : ''}>
      [${m.manager_id_code}] ${m.name} (${m.email})${disabledText}
    </option>`;
  });
  select.innerHTML = html;
}

function handleManagerSelectChange() {
  const select = document.getElementById('branchManagerSelect');
  if (!select) return;

  const selectedOpt = select.options[select.selectedIndex];
  if (selectedOpt && selectedOpt.value) {
    document.getElementById('branchManagerName').value = selectedOpt.getAttribute('data-name') || '';
    document.getElementById('branchManagerEmail').value = selectedOpt.getAttribute('data-email') || '';
    document.getElementById('branchManagerPhone').value = selectedOpt.getAttribute('data-mobile') || '';
  } else {
    document.getElementById('branchManagerName').value = '';
    document.getElementById('branchManagerEmail').value = '';
    document.getElementById('branchManagerPhone').value = '';
  }
}

async function loadBranches() {
  const tbody = document.getElementById('branchesTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-4">
          <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
          Loading branch outlets...
        </td>
      </tr>
    `;
  }

  try {
    const data = await apiRequest('/api/branches');
    allBranches = data.branches || [];
    renderBranches(allBranches);
  } catch (err) {
    console.error('Failed to load branches:', err);
    UI.showToast('Could not load branches: ' + err.message, 'danger');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-danger">
            Failed to load branch data. Please try again.
          </td>
        </tr>
      `;
    }
  }
}

function renderBranches(branches) {
  const tbody = document.getElementById('branchesTableBody');
  const countEl = document.getElementById('branchesCountBadge');
  if (countEl) countEl.textContent = `${branches.length} Outlets`;

  if (!tbody) return;

  if (branches.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <i class="bi bi-shop-window empty-state-icon"></i>
            <div class="empty-state-title">No branches found</div>
            <div class="empty-state-description">
              Create your first restaurant outlet to begin centralized sales and inventory tracking.
            </div>
            <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#branchModal" onclick="prepareCreateBranchModal()">
              <i class="bi bi-plus-lg me-1"></i> Add Branch
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const html = branches.map(b => {
    let badgeClass = 'badge-active';
    if (b.status === 'Under-performing') badgeClass = 'badge-underperforming';
    else if (b.status === 'Out of Stock') badgeClass = 'badge-out-of-stock';

    const completion = b.target_completion || 0;
    const invPct = b.inventory_percentage !== undefined ? b.inventory_percentage : 100;
    let invBarColor = 'bg-success';
    if (invPct < 50) invBarColor = 'bg-danger';
    else if (invPct < 80) invBarColor = 'bg-warning';

    return `
      <tr>
        <td>
          <div class="fw-semibold text-dark">${b.name}</div>
          <div class="small text-muted">Code: <span class="badge bg-light text-dark border">${b.code}</span></div>
        </td>
        <td>
          <div>${b.city}, ${b.state}</div>
          <div class="small text-muted text-truncate" style="max-width: 200px;">${b.address || '—'}</div>
        </td>
        <td>
          <div>${b.manager_name || 'Unassigned'}</div>
          <div class="small text-muted">${b.manager_phone || b.manager_email || '—'}</div>
        </td>
        <td>
          <span class="status-badge ${badgeClass}">${b.status || 'Active'}</span>
        </td>
        <td>
          <div class="fw-medium">${UI.formatCurrency(b.monthly_revenue || 0)}</div>
          <div class="small text-muted">Target: ${UI.formatCurrency(b.monthly_target || 0)} (${completion}%)</div>
        </td>
        <td style="min-width: 140px;">
          <div class="d-flex justify-content-between small mb-1">
            <span>Inventory Health</span>
            <span class="fw-semibold">${invPct}%</span>
          </div>
          <div class="progress" style="height: 6px;">
            <div class="progress-bar ${invBarColor}" role="progressbar" style="width: ${invPct}%"></div>
          </div>
        </td>
        <td class="text-end">
          <div class="btn-group">
            <a href="/branch-details.html?id=${b.id}" class="btn btn-sm btn-outline-secondary" title="View Outlet Details">
              <i class="bi bi-eye"></i>
            </a>
            ${currentUserRole === 'owner' ? `
              <button class="btn btn-sm btn-outline-secondary" onclick="prepareEditBranchModal('${b.id}')" title="Edit Outlet">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-secondary text-danger" onclick="confirmDeleteBranch('${b.id}', '${b.name}')" title="Delete Outlet">
                <i class="bi bi-trash"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

function setupBranchEventListeners() {
  // Search and filter
  const searchInput = document.getElementById('branchSearchInput');
  const statusFilter = document.getElementById('branchStatusFilter');

  function applyFilters() {
    const q = (searchInput?.value || '').toLowerCase().trim();
    const st = statusFilter?.value || 'all';

    const filtered = allBranches.filter(b => {
      const matchesSearch = !q ||
        b.name.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q);

      const matchesStatus = (st === 'all') || (b.status === st);
      return matchesSearch && matchesStatus;
    });

    renderBranches(filtered);
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (statusFilter) statusFilter.addEventListener('change', applyFilters);

  // Manager Select Change listener
  const mgrSelect = document.getElementById('branchManagerSelect');
  if (mgrSelect) {
    mgrSelect.addEventListener('change', handleManagerSelectChange);
  }

  // Form Submission
  const branchForm = document.getElementById('branchForm');
  if (branchForm) {
    branchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveBranch();
    });
  }
}

async function prepareCreateBranchModal() {
  const form = document.getElementById('branchForm');
  if (form) form.reset();

  document.getElementById('branchModalTitle').textContent = 'Add New Branch Outlet';
  document.getElementById('branchIdInput').value = '';
  document.getElementById('branchOpeningDate').value = new Date().toISOString().split('T')[0];

  // Refresh managers list and populate select
  await loadCreatedManagers();
  populateManagerDropdown('', '');
  handleManagerSelectChange();
}

async function prepareEditBranchModal(branchId) {
  const branch = allBranches.find(b => b.id === branchId);
  if (!branch) return;

  document.getElementById('branchModalTitle').textContent = 'Edit Branch Outlet';
  document.getElementById('branchIdInput').value = branch.id;
  document.getElementById('branchName').value = branch.name || '';
  document.getElementById('branchCode').value = branch.code || '';
  document.getElementById('branchAddress').value = branch.address || '';
  document.getElementById('branchCity').value = branch.city || '';
  document.getElementById('branchState').value = branch.state || '';
  document.getElementById('branchMonthlyTarget').value = branch.monthly_target || '';
  document.getElementById('branchOpeningDate').value = branch.opening_date || '';
  document.getElementById('branchStatus').value = branch.status || 'Active';

  // Refresh managers list and select current manager
  await loadCreatedManagers();
  populateManagerDropdown(branch.manager_id, branch.manager_email);
  handleManagerSelectChange();

  const modalEl = document.getElementById('branchModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
}

async function handleSaveBranch() {
  const submitBtn = document.getElementById('saveBranchBtn');
  const branchId = document.getElementById('branchIdInput').value;

  const mgrSelect = document.getElementById('branchManagerSelect');
  const selectedManagerId = mgrSelect ? mgrSelect.value : null;

  const payload = {
    name: document.getElementById('branchName').value.trim(),
    code: document.getElementById('branchCode').value.trim(),
    address: document.getElementById('branchAddress').value.trim(),
    city: document.getElementById('branchCity').value.trim(),
    state: document.getElementById('branchState').value.trim(),
    manager_id: selectedManagerId || null,
    manager_name: document.getElementById('branchManagerName').value.trim() || null,
    manager_email: document.getElementById('branchManagerEmail').value.trim() || null,
    manager_phone: document.getElementById('branchManagerPhone').value.trim() || null,
    monthly_target: Number(document.getElementById('branchMonthlyTarget').value) || 0,
    opening_date: document.getElementById('branchOpeningDate').value,
    status: document.getElementById('branchStatus').value
  };

  if (!payload.name || !payload.code || !payload.city || !payload.state) {
    UI.showToast('Please fill all mandatory fields (Name, Code, City, State)', 'warning');
    return;
  }

  UI.setButtonLoading(submitBtn, true, '', 'Saving Outlet...');

  try {
    let result;
    if (branchId) {
      result = await apiRequest(`/api/branches/${branchId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      UI.showToast('Branch outlet updated successfully.', 'success');
    } else {
      result = await apiRequest('/api/branches', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      UI.showToast('Branch outlet registered successfully.', 'success');
    }

    const modalEl = document.getElementById('branchModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    await loadBranches();
  } catch (err) {
    console.error('Save branch error:', err);
    UI.showToast(err.message || 'Failed to save branch.', 'danger');
  } finally {
    UI.setButtonLoading(submitBtn, false);
  }
}

function confirmDeleteBranch(branchId, branchName) {
  UI.showConfirmModal({
    title: 'Delete Branch Outlet',
    message: `Are you sure you want to delete ${branchName}? All associated sales records, inventory entries, and reports will be permanently removed. This action cannot be undone.`,
    confirmBtnText: 'Delete Branch',
    isDanger: true,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/branches/${branchId}`, { method: 'DELETE' });
        UI.showToast(`${branchName} deleted successfully.`, 'success');
        await loadBranches();
      } catch (err) {
        console.error('Delete branch error:', err);
        UI.showToast(err.message || 'Failed to delete branch.', 'danger');
      }
    }
  });
}
