/**
 * OwnerDesk - Sales Module Controller
 * Handles daily sales submission, duplicate protection, filtering, calculations, and CSV export
 */

let allSales = [];
let allBranches = [];

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  UI.initSidebar('sales');
  setupSalesCalculations();
  setupSalesFilters();
  await loadBranchesDropdown();
  await loadSales();
});

async function loadBranchesDropdown() {
  try {
    const res = await apiRequest('/api/branches');
    allBranches = res.branches || [];

    const branchFilter = document.getElementById('salesBranchFilter');
    const branchModalSelect = document.getElementById('saleBranchSelect');

    const options = allBranches.map(b => `<option value="${b.id}">${b.name} (${b.code})</option>`).join('');

    const userStr = localStorage.getItem('ownerdesk_user');
    let userRole = 'owner';
    if (userStr) {
      try { userRole = (JSON.parse(userStr).role || 'owner').toLowerCase(); } catch (e) {}
    }

    if (userRole === 'manager' && allBranches.length > 0) {
      if (branchFilter) {
        branchFilter.innerHTML = options;
        branchFilter.value = allBranches[0].id;
        branchFilter.disabled = true;
      }
      if (branchModalSelect) {
        branchModalSelect.innerHTML = options;
        branchModalSelect.value = allBranches[0].id;
      }
    } else {
      if (branchFilter) {
        branchFilter.innerHTML = `<option value="all">All Branches</option>` + options;
      }
      if (branchModalSelect) {
        branchModalSelect.innerHTML = `<option value="" disabled selected>Select Branch</option>` + options;
      }
    }
  } catch (e) {
    console.error('Failed to load branches dropdown:', e);
  }
}

async function loadSales() {
  const tbody = document.getElementById('salesTableBody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><span class="spinner-border spinner-border-sm text-primary me-2"></span>Loading sales records...</td></tr>`;
  }

  try {
    const branchFilter = document.getElementById('salesBranchFilter')?.value || 'all';
    const startDate = document.getElementById('salesStartDate')?.value || '';
    const endDate = document.getElementById('salesEndDate')?.value || '';

    let url = `/api/sales?branch_id=${branchFilter}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;

    const res = await apiRequest(url);
    allSales = res.sales || [];
    renderSales(allSales);
  } catch (err) {
    console.error('Failed to load sales:', err);
    UI.showToast('Could not load sales: ' + err.message, 'danger');
  }
}

function renderSales(sales) {
  const tbody = document.getElementById('salesTableBody');
  const totalCountEl = document.getElementById('totalSalesCountBadge');
  const sumNetEl = document.getElementById('totalNetSalesAmount');

  let totalNet = 0;
  sales.forEach(s => totalNet += Number(s.net_sales || 0));

  if (totalCountEl) totalCountEl.textContent = `${sales.length} Records`;
  if (sumNetEl) sumNetEl.textContent = UI.formatCurrency(totalNet);

  if (!tbody) return;

  if (sales.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <i class="bi bi-receipt-cutoff empty-state-icon"></i>
            <div class="empty-state-title">No sales records found</div>
            <div class="empty-state-description">Submit daily sales reports for your outlets to keep financial metrics up to date.</div>
            <button class="btn btn-primary" onclick="prepareCreateSaleModal()">
              <i class="bi bi-plus-lg me-1"></i> Submit Daily Sales
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const html = sales.map(s => {
    const branchName = s.branches ? s.branches.name : 'Unknown Branch';
    const net = Number(s.net_sales || 0);

    return `
      <tr>
        <td class="fw-semibold">${UI.formatDate(s.sale_date)}</td>
        <td>${branchName}</td>
        <td>${s.total_orders || 0}</td>
        <td>${UI.formatCurrency(s.gross_sales)}</td>
        <td class="text-muted">${UI.formatCurrency(s.discounts)}</td>
        <td class="text-muted">${UI.formatCurrency(s.tax)}</td>
        <td class="fw-bold text-success">${UI.formatCurrency(net)}</td>
        <td>
          <div class="small">Cash: ${UI.formatCurrency(s.cash_amount)}</div>
          <div class="small">UPI: ${UI.formatCurrency(s.upi_amount)}</div>
          <div class="small">Card: ${UI.formatCurrency(s.card_amount)}</div>
        </td>
        <td class="text-end">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-secondary" onclick="prepareEditSaleModal('${s.id}')" title="Edit">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary text-danger" onclick="confirmDeleteSale('${s.id}')" title="Delete">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

function setupSalesCalculations() {
  const grossInput = document.getElementById('saleGross');
  const discountInput = document.getElementById('saleDiscounts');
  const taxInput = document.getElementById('saleTax');
  const netDisplay = document.getElementById('saleNetCalculated');

  function updateNet() {
    const gross = Number(grossInput?.value) || 0;
    const disc = Number(discountInput?.value) || 0;
    const tax = Number(taxInput?.value) || 0;
    const net = gross - disc + tax;
    if (netDisplay) {
      netDisplay.textContent = UI.formatCurrency(net);
    }
  }

  if (grossInput) grossInput.addEventListener('input', updateNet);
  if (discountInput) discountInput.addEventListener('input', updateNet);
  if (taxInput) taxInput.addEventListener('input', updateNet);
}

function setupSalesFilters() {
  const branchFilter = document.getElementById('salesBranchFilter');
  const startDate = document.getElementById('salesStartDate');
  const endDate = document.getElementById('salesEndDate');
  const searchInput = document.getElementById('salesSearchInput');

  if (branchFilter) branchFilter.addEventListener('change', loadSales);
  if (startDate) startDate.addEventListener('change', loadSales);
  if (endDate) endDate.addEventListener('change', loadSales);

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = allSales.filter(s => {
        const bName = (s.branches?.name || '').toLowerCase();
        return bName.includes(q) || s.sale_date.includes(q);
      });
      renderSales(filtered);
    });
  }

  const exportBtn = document.getElementById('exportSalesCsvBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSalesToCSV);
  }

  const saleForm = document.getElementById('saleForm');
  if (saleForm) {
    saleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveSale();
    });
  }
}

function prepareCreateSaleModal() {
  const form = document.getElementById('saleForm');
  if (form) form.reset();

  document.getElementById('saleModalTitle').textContent = 'Submit Daily Sales Report';
  document.getElementById('saleIdInput').value = '';
  document.getElementById('saleDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('saleNetCalculated').textContent = '₹0';
  document.getElementById('saleBranchSelect').disabled = false;

  const modalEl = document.getElementById('saleModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
}

function prepareEditSaleModal(saleId) {
  const s = allSales.find(item => item.id === saleId);
  if (!s) return;

  document.getElementById('saleModalTitle').textContent = 'Edit Sales Entry';
  document.getElementById('saleIdInput').value = s.id;
  document.getElementById('saleBranchSelect').value = s.branch_id;
  document.getElementById('saleBranchSelect').disabled = true; // Lock branch when editing
  document.getElementById('saleDate').value = s.sale_date;
  document.getElementById('saleTotalOrders').value = s.total_orders;
  document.getElementById('saleGross').value = s.gross_sales;
  document.getElementById('saleDiscounts').value = s.discounts;
  document.getElementById('saleTax').value = s.tax;
  document.getElementById('saleCash').value = s.cash_amount;
  document.getElementById('saleCard').value = s.card_amount;
  document.getElementById('saleUpi').value = s.upi_amount;
  document.getElementById('saleNotes').value = s.notes || '';
  document.getElementById('saleNetCalculated').textContent = UI.formatCurrency(s.net_sales);

  const modalEl = document.getElementById('saleModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
}

async function handleSaveSale() {
  const submitBtn = document.getElementById('saveSaleBtn');
  const saleId = document.getElementById('saleIdInput').value;

  const payload = {
    branch_id: document.getElementById('saleBranchSelect').value,
    sale_date: document.getElementById('saleDate').value,
    total_orders: Number(document.getElementById('saleTotalOrders').value) || 0,
    gross_sales: Number(document.getElementById('saleGross').value) || 0,
    discounts: Number(document.getElementById('saleDiscounts').value) || 0,
    tax: Number(document.getElementById('saleTax').value) || 0,
    cash_amount: Number(document.getElementById('saleCash').value) || 0,
    card_amount: Number(document.getElementById('saleCard').value) || 0,
    upi_amount: Number(document.getElementById('saleUpi').value) || 0,
    notes: document.getElementById('saleNotes').value.trim()
  };

  if (!payload.branch_id || !payload.sale_date) {
    UI.showToast('Branch and sale date are required.', 'warning');
    return;
  }

  UI.setButtonLoading(submitBtn, true, '', 'Saving Report...');

  try {
    if (saleId) {
      await apiRequest(`/api/sales/${saleId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      UI.showToast('Sales report updated successfully.', 'success');
    } else {
      await apiRequest('/api/sales', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      UI.showToast('Daily sales report submitted successfully.', 'success');
    }

    const modalEl = document.getElementById('saleModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    await loadSales();
  } catch (err) {
    console.error('Save sale error:', err);
    UI.showToast(err.message || 'Failed to save sales report.', 'danger');
  } finally {
    UI.setButtonLoading(submitBtn, false);
  }
}

function confirmDeleteSale(saleId) {
  UI.showConfirmModal({
    title: 'Delete Sales Entry',
    message: 'Are you sure you want to delete this sales record? Financial aggregates will be updated automatically.',
    confirmBtnText: 'Delete Record',
    isDanger: true,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/sales/${saleId}`, { method: 'DELETE' });
        UI.showToast('Sales entry removed.', 'success');
        await loadSales();
      } catch (err) {
        UI.showToast(err.message || 'Failed to delete record.', 'danger');
      }
    }
  });
}

function exportSalesToCSV() {
  if (allSales.length === 0) {
    UI.showToast('No sales records to export.', 'warning');
    return;
  }

  const headers = ['Date', 'Branch', 'Total Orders', 'Gross Sales', 'Discounts', 'Tax', 'Net Sales', 'Cash', 'Card', 'UPI', 'Notes'];
  const rows = allSales.map(s => [
    s.sale_date,
    `"${(s.branches?.name || '').replace(/"/g, '""')}"`,
    s.total_orders,
    s.gross_sales,
    s.discounts,
    s.tax,
    s.net_sales,
    s.cash_amount,
    s.card_amount,
    s.upi_amount,
    `"${(s.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `ownerdesk_sales_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}
