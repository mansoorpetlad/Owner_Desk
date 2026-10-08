/**
 * OwnerDesk - Inventory Management Controller
 * Tracks raw materials, ingredients, stock thresholds, and alerts
 */

let allInventory = [];
let allBranches = [];

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  UI.initSidebar('inventory');
  setupInventoryEventListeners();
  await loadBranchesDropdown();
  await loadInventory();
});

async function loadBranchesDropdown() {
  try {
    const res = await apiRequest('/api/branches');
    allBranches = res.branches || [];

    const filterSelect = document.getElementById('inventoryBranchFilter');
    const modalSelect = document.getElementById('inventoryBranchSelect');

    const options = allBranches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

    const userStr = localStorage.getItem('ownerdesk_user');
    let userRole = 'owner';
    if (userStr) {
      try { userRole = (JSON.parse(userStr).role || 'owner').toLowerCase(); } catch (e) {}
    }

    if (userRole === 'manager' && allBranches.length > 0) {
      if (filterSelect) {
        filterSelect.innerHTML = options;
        filterSelect.value = allBranches[0].id;
        filterSelect.disabled = true;
      }
      if (modalSelect) {
        modalSelect.innerHTML = options;
        modalSelect.value = allBranches[0].id;
      }
    } else {
      if (filterSelect) filterSelect.innerHTML = `<option value="all">All Branches</option>` + options;
      if (modalSelect) modalSelect.innerHTML = `<option value="" disabled selected>Select Branch</option>` + options;
    }
  } catch (e) {
    console.error('Failed to load branches dropdown:', e);
  }
}

async function loadInventory() {
  const tbody = document.getElementById('inventoryTableBody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><span class="spinner-border spinner-border-sm text-primary me-2"></span>Loading inventory items...</td></tr>`;
  }

  try {
    const branch = document.getElementById('inventoryBranchFilter')?.value || 'all';
    const status = document.getElementById('inventoryStatusFilter')?.value || 'all';
    const search = document.getElementById('inventorySearchInput')?.value || '';

    let url = `/api/inventory?branch_id=${branch}&status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await apiRequest(url);
    allInventory = res.inventory || [];
    renderInventory(allInventory, res.summary || {});
  } catch (err) {
    console.error('Failed to load inventory:', err);
    UI.showToast('Could not load inventory: ' + err.message, 'danger');
  }
}

function renderInventory(items, summary) {
  const tbody = document.getElementById('inventoryTableBody');
  const inStockEl = document.getElementById('kpiInStockCount');
  const lowStockEl = document.getElementById('kpiLowStockCount');
  const outOfStockEl = document.getElementById('kpiOutOfStockCount');
  const totalCountEl = document.getElementById('inventoryCountBadge');

  if (inStockEl) inStockEl.textContent = summary.in_stock || 0;
  if (lowStockEl) lowStockEl.textContent = summary.low_stock || 0;
  if (outOfStockEl) outOfStockEl.textContent = summary.out_of_stock || 0;
  if (totalCountEl) totalCountEl.textContent = `${items.length} Items`;

  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <i class="bi bi-box-seam empty-state-icon"></i>
            <div class="empty-state-title">No inventory items found</div>
            <div class="empty-state-description">Maintain stock levels for key ingredients like rice, oil, meat, dairy, and packaging.</div>
            <button class="btn btn-primary" onclick="prepareCreateInventoryModal()">
              <i class="bi bi-plus-lg me-1"></i> Add Inventory Item
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const html = items.map(item => {
    const branchName = item.branches ? item.branches.name : 'Unknown';
    let badgeClass = 'badge-in-stock';
    if (item.status === 'Low Stock') badgeClass = 'badge-low-stock';
    else if (item.status === 'Out of Stock') badgeClass = 'badge-out-of-stock';

    let progressColor = 'bg-success';
    if (item.status === 'Out of Stock') progressColor = 'bg-danger';
    else if (item.status === 'Low Stock') progressColor = 'bg-warning';

    return `
      <tr>
        <td>
          <div class="fw-semibold text-dark">${item.item_name}</div>
          <div class="small text-muted">Supplier: ${item.supplier || '—'}</div>
        </td>
        <td>${branchName}</td>
        <td><span class="badge bg-light text-dark border">${item.category}</span></td>
        <td>
          <div class="fw-bold">${item.current_quantity} <span class="fw-normal text-muted">${item.unit}</span></div>
          <div class="small text-muted">Min: ${item.minimum_quantity} ${item.unit}</div>
        </td>
        <td style="min-width: 130px;">
          <div class="d-flex justify-content-between small mb-1">
            <span>Availability</span>
            <span class="fw-semibold">${item.stock_progress}%</span>
          </div>
          <div class="progress" style="height: 6px;">
            <div class="progress-bar ${progressColor}" role="progressbar" style="width: ${item.stock_progress}%"></div>
          </div>
        </td>
        <td><span class="status-badge ${badgeClass}">${item.status}</span></td>
        <td>${UI.formatCurrency(item.cost_per_unit)} / ${item.unit}</td>
        <td class="text-end">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-secondary" onclick="prepareEditInventoryModal('${item.id}')" title="Edit Item">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary text-danger" onclick="confirmDeleteInventory('${item.id}')" title="Delete Item">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

function setupInventoryEventListeners() {
  const branchFilter = document.getElementById('inventoryBranchFilter');
  const statusFilter = document.getElementById('inventoryStatusFilter');
  const searchInput = document.getElementById('inventorySearchInput');

  if (branchFilter) branchFilter.addEventListener('change', loadInventory);
  if (statusFilter) statusFilter.addEventListener('change', loadInventory);
  if (searchInput) searchInput.addEventListener('input', loadInventory);

  const form = document.getElementById('inventoryForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveInventory();
    });
  }
}

function prepareCreateInventoryModal() {
  const form = document.getElementById('inventoryForm');
  if (form) form.reset();

  document.getElementById('inventoryModalTitle').textContent = 'Add Inventory Item';
  document.getElementById('inventoryIdInput').value = '';

  const modalEl = document.getElementById('inventoryModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
}

function prepareEditInventoryModal(itemId) {
  const item = allInventory.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById('inventoryModalTitle').textContent = 'Edit Inventory Item';
  document.getElementById('inventoryIdInput').value = item.id;
  document.getElementById('inventoryBranchSelect').value = item.branch_id;
  document.getElementById('inventoryItemName').value = item.item_name;
  document.getElementById('inventoryCategory').value = item.category;
  document.getElementById('inventoryCurrentQty').value = item.current_quantity;
  document.getElementById('inventoryUnit').value = item.unit;
  document.getElementById('inventoryMinQty').value = item.minimum_quantity;
  document.getElementById('inventoryCostPerUnit').value = item.cost_per_unit;
  document.getElementById('inventorySupplier').value = item.supplier || '';

  const modalEl = document.getElementById('inventoryModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
}

async function handleSaveInventory() {
  const submitBtn = document.getElementById('saveInventoryBtn');
  const itemId = document.getElementById('inventoryIdInput').value;

  const payload = {
    branch_id: document.getElementById('inventoryBranchSelect').value,
    item_name: document.getElementById('inventoryItemName').value.trim(),
    category: document.getElementById('inventoryCategory').value.trim(),
    current_quantity: Number(document.getElementById('inventoryCurrentQty').value) || 0,
    unit: document.getElementById('inventoryUnit').value.trim(),
    minimum_quantity: Number(document.getElementById('inventoryMinQty').value) || 0,
    cost_per_unit: Number(document.getElementById('inventoryCostPerUnit').value) || 0,
    supplier: document.getElementById('inventorySupplier').value.trim()
  };

  if (!payload.branch_id || !payload.item_name || !payload.unit) {
    UI.showToast('Branch, item name, and unit are required.', 'warning');
    return;
  }

  UI.setButtonLoading(submitBtn, true, '', 'Saving Stock Item...');

  try {
    if (itemId) {
      await apiRequest(`/api/inventory/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      UI.showToast('Inventory item updated successfully.', 'success');
    } else {
      await apiRequest('/api/inventory', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      UI.showToast('Inventory item added successfully.', 'success');
    }

    const modalEl = document.getElementById('inventoryModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    await loadInventory();
    UI.refreshNotificationBadge();
  } catch (err) {
    console.error('Save inventory error:', err);
    UI.showToast(err.message || 'Failed to save inventory item.', 'danger');
  } finally {
    UI.setButtonLoading(submitBtn, false);
  }
}

function confirmDeleteInventory(itemId) {
  UI.showConfirmModal({
    title: 'Delete Inventory Item',
    message: 'Are you sure you want to remove this inventory item from the outlet register?',
    confirmBtnText: 'Delete Item',
    isDanger: true,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/inventory/${itemId}`, { method: 'DELETE' });
        UI.showToast('Item deleted successfully.', 'success');
        await loadInventory();
      } catch (err) {
        UI.showToast(err.message || 'Failed to delete item.', 'danger');
      }
    }
  });
}
