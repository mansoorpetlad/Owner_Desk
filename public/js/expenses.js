/**
 * OwnerDesk - Expenses Management Controller
 * Tracks operational overheads, category breakdowns, and cost trends
 */

let allExpenses = [];
let allBranches = [];
let expenseBreakdownChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  UI.initSidebar('expenses');
  setupExpenseEventListeners();
  await loadBranchesDropdown();
  await loadExpenses();
});

async function loadBranchesDropdown() {
  try {
    const res = await apiRequest('/api/branches');
    allBranches = res.branches || [];

    const filterSelect = document.getElementById('expenseBranchFilter');
    const modalSelect = document.getElementById('expenseBranchSelect');

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

async function loadExpenses() {
  const tbody = document.getElementById('expensesTableBody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm text-primary me-2"></span>Loading expenses...</td></tr>`;
  }

  try {
    const branch = document.getElementById('expenseBranchFilter')?.value || 'all';
    const category = document.getElementById('expenseCategoryFilter')?.value || 'all';
    const startDate = document.getElementById('expenseStartDate')?.value || '';
    const endDate = document.getElementById('expenseEndDate')?.value || '';

    let url = `/api/expenses?branch_id=${branch}&category=${category}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;

    const res = await apiRequest(url);
    allExpenses = res.expenses || [];
    renderExpenses(allExpenses, res.total_amount || 0);
    renderCategoryChart(res.category_breakdown || {});
  } catch (err) {
    console.error('Failed to load expenses:', err);
    UI.showToast('Could not load expenses: ' + err.message, 'danger');
  }
}

function renderExpenses(expenses, totalAmount) {
  const tbody = document.getElementById('expensesTableBody');
  const totalAmountEl = document.getElementById('totalExpensesAmountBadge');
  const countBadgeEl = document.getElementById('totalExpensesCountBadge');

  if (totalAmountEl) totalAmountEl.textContent = UI.formatCurrency(totalAmount);
  if (countBadgeEl) countBadgeEl.textContent = `${expenses.length} Records`;

  if (!tbody) return;

  if (expenses.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <i class="bi bi-wallet2 empty-state-icon"></i>
            <div class="empty-state-title">No expenses recorded</div>
            <div class="empty-state-description">Keep operational costs under control by tracking ingredient supplies, utility bills, and salaries.</div>
            <button class="btn btn-primary" onclick="prepareCreateExpenseModal()">
              <i class="bi bi-plus-lg me-1"></i> Add Expense
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const html = expenses.map(e => {
    const branchName = e.branches ? e.branches.name : 'Unknown Branch';

    return `
      <tr>
        <td class="fw-semibold">${UI.formatDate(e.expense_date)}</td>
        <td>${branchName}</td>
        <td><span class="badge bg-light text-dark border">${e.category}</span></td>
        <td>${e.description || '—'}</td>
        <td><span class="small text-muted">${e.payment_method}</span></td>
        <td class="fw-bold text-dark">${UI.formatCurrency(e.amount)}</td>
        <td class="text-end">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-secondary" onclick="prepareEditExpenseModal('${e.id}')" title="Edit">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary text-danger" onclick="confirmDeleteExpense('${e.id}')" title="Delete">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

function renderCategoryChart(breakdown) {
  const ctx = document.getElementById('expenseCategoryChart');
  if (!ctx) return;

  if (expenseBreakdownChart) {
    expenseBreakdownChart.destroy();
  }

  const labels = Object.keys(breakdown);
  const data = Object.values(breakdown);

  const colors = [
    '#2563eb', '#16a34a', '#d97706', '#dc2626',
    '#7c3aed', '#0d9488', '#ea580c', '#475569'
  ];

  expenseBreakdownChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.length > 0 ? labels : ['Food Supplies', 'Salaries', 'Utilities', 'Rent'],
      datasets: [{
        data: data.length > 0 ? data : [45000, 85000, 20000, 35000],
        backgroundColor: colors.slice(0, Math.max(labels.length, 4)),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, font: { family: 'Inter', size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: (item) => `${item.label}: ${UI.formatCurrency(item.raw)}`
          }
        }
      }
    }
  });
}

function setupExpenseEventListeners() {
  const branchFilter = document.getElementById('expenseBranchFilter');
  const catFilter = document.getElementById('expenseCategoryFilter');
  const startDate = document.getElementById('expenseStartDate');
  const endDate = document.getElementById('expenseEndDate');

  if (branchFilter) branchFilter.addEventListener('change', loadExpenses);
  if (catFilter) catFilter.addEventListener('change', loadExpenses);
  if (startDate) startDate.addEventListener('change', loadExpenses);
  if (endDate) endDate.addEventListener('change', loadExpenses);

  const form = document.getElementById('expenseForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveExpense();
    });
  }
}

function prepareCreateExpenseModal() {
  const form = document.getElementById('expenseForm');
  if (form) form.reset();

  document.getElementById('expenseModalTitle').textContent = 'Add Operational Expense';
  document.getElementById('expenseIdInput').value = '';
  document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];

  const modalEl = document.getElementById('expenseModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
}

function prepareEditExpenseModal(expenseId) {
  const exp = allExpenses.find(e => e.id === expenseId);
  if (!exp) return;

  document.getElementById('expenseModalTitle').textContent = 'Edit Operational Expense';
  document.getElementById('expenseIdInput').value = exp.id;
  document.getElementById('expenseBranchSelect').value = exp.branch_id;
  document.getElementById('expenseDate').value = exp.expense_date;
  document.getElementById('expenseCategory').value = exp.category;
  document.getElementById('expenseAmount').value = exp.amount;
  document.getElementById('expensePaymentMethod').value = exp.payment_method;
  document.getElementById('expenseDescription').value = exp.description || '';
  document.getElementById('expenseNotes').value = exp.notes || '';

  const modalEl = document.getElementById('expenseModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
}

async function handleSaveExpense() {
  const submitBtn = document.getElementById('saveExpenseBtn');
  const expenseId = document.getElementById('expenseIdInput').value;

  const payload = {
    branch_id: document.getElementById('expenseBranchSelect').value,
    expense_date: document.getElementById('expenseDate').value,
    category: document.getElementById('expenseCategory').value,
    amount: Number(document.getElementById('expenseAmount').value) || 0,
    payment_method: document.getElementById('expensePaymentMethod').value,
    description: document.getElementById('expenseDescription').value.trim(),
    notes: document.getElementById('expenseNotes').value.trim()
  };

  if (!payload.branch_id || !payload.expense_date || !payload.category || !payload.amount) {
    UI.showToast('Branch, date, category, and amount are required.', 'warning');
    return;
  }

  UI.setButtonLoading(submitBtn, true, '', 'Saving Expense...');

  try {
    if (expenseId) {
      await apiRequest(`/api/expenses/${expenseId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      UI.showToast('Expense updated successfully.', 'success');
    } else {
      await apiRequest('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      UI.showToast('Expense added successfully.', 'success');
    }

    const modalEl = document.getElementById('expenseModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    await loadExpenses();
  } catch (err) {
    console.error('Save expense error:', err);
    UI.showToast(err.message || 'Failed to save expense.', 'danger');
  } finally {
    UI.setButtonLoading(submitBtn, false);
  }
}

function confirmDeleteExpense(expenseId) {
  UI.showConfirmModal({
    title: 'Delete Expense',
    message: 'Are you sure you want to delete this expense record? This will adjust financial reports accordingly.',
    confirmBtnText: 'Delete Expense',
    isDanger: true,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/expenses/${expenseId}`, { method: 'DELETE' });
        UI.showToast('Expense record deleted.', 'success');
        await loadExpenses();
      } catch (err) {
        UI.showToast(err.message || 'Failed to delete expense.', 'danger');
      }
    }
  });
}
