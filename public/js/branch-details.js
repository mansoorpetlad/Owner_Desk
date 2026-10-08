/**
 * OwnerDesk - Branch Outlet Deep Dive Controller
 */

let currentBranchId = null;
let branchSalesChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  UI.initSidebar('branches');

  const params = new URLSearchParams(window.location.search);
  currentBranchId = params.get('id');

  if (!currentBranchId) {
    UI.showToast('No branch specified. Redirecting...', 'warning');
    setTimeout(() => window.location.href = '/branches.html', 1500);
    return;
  }

  loadBranchDetails(currentBranchId);
});

async function loadBranchDetails(branchId) {
  try {
    const data = await apiRequest(`/api/branches/${branchId}`);
    const { branch, kpis, recent_sales, recent_expenses, inventory, recent_reports } = data;

    // Header info
    document.getElementById('branchDetailName').textContent = branch.name;
    document.getElementById('branchDetailLocation').textContent = `${branch.address || ''}, ${branch.city}, ${branch.state}`;
    document.getElementById('branchDetailCode').textContent = `Code: ${branch.code}`;
    document.getElementById('branchDetailManager').textContent = `Manager: ${branch.manager_name || 'Unassigned'} (${branch.manager_phone || branch.manager_email || '—'})`;

    const statusBadge = document.getElementById('branchDetailStatus');
    let badgeClass = 'badge-active';
    if (branch.status === 'Under-performing') badgeClass = 'badge-underperforming';
    else if (branch.status === 'Out of Stock') badgeClass = 'badge-out-of-stock';
    statusBadge.className = `status-badge ${badgeClass}`;
    statusBadge.textContent = branch.status || 'Active';

    // KPIs
    document.getElementById('kpiTodaySales').textContent = UI.formatCurrency(kpis.today_sales);
    document.getElementById('kpiMonthlySales').textContent = UI.formatCurrency(kpis.monthly_sales);
    document.getElementById('kpiMonthlyTarget').textContent = UI.formatCurrency(kpis.monthly_target);
    document.getElementById('kpiTargetCompletion').textContent = `${kpis.target_completion}%`;
    document.getElementById('kpiInventoryStatus').textContent = `${kpis.inventory_status}%`;
    document.getElementById('kpiTotalExpenses').textContent = UI.formatCurrency(kpis.total_expenses);

    // Sales Performance Chart
    renderBranchSalesChart(recent_sales);

    // Inventory Table
    renderBranchInventoryTable(inventory);

    // Expenses Table
    renderBranchExpensesTable(recent_expenses);

    // Reports Timeline
    renderBranchReports(recent_reports);

  } catch (err) {
    console.error('Error loading branch details:', err);
    UI.showToast('Could not load branch details: ' + err.message, 'danger');
  }
}

function renderBranchSalesChart(salesList) {
  const ctx = document.getElementById('branchSalesChart');
  if (!ctx) return;

  if (branchSalesChart) {
    branchSalesChart.destroy();
  }

  const sortedSales = [...salesList].reverse();
  const labels = sortedSales.map(s => UI.formatDate(s.sale_date));
  const data = sortedSales.map(s => s.net_sales);

  branchSalesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length > 0 ? labels : ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'],
      datasets: [{
        label: 'Net Sales',
        data: data.length > 0 ? data : [24000, 31000, 28000, 35000, 42000],
        borderColor: '#2563eb',
        backgroundColor: '#eff6ff',
        fill: true,
        tension: 0.3,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => `Net Sales: ${UI.formatCurrency(item.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: { callback: (v) => '₹' + (v >= 1000 ? (v / 1000) + 'k' : v) },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });
}

function renderBranchInventoryTable(items) {
  const tbody = document.getElementById('branchInventoryTableBody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No inventory records for this branch.</td></tr>`;
    return;
  }

  const html = items.map(i => {
    let badgeClass = 'badge-in-stock';
    let status = 'In Stock';
    const curr = Number(i.current_quantity);
    const min = Number(i.minimum_quantity);

    if (curr === 0) {
      status = 'Out of Stock';
      badgeClass = 'badge-out-of-stock';
    } else if (curr <= min) {
      status = 'Low Stock';
      badgeClass = 'badge-low-stock';
    }

    return `
      <tr>
        <td class="fw-medium">${i.item_name}</td>
        <td>${i.category}</td>
        <td>${curr} ${i.unit}</td>
        <td>${min} ${i.unit}</td>
        <td><span class="status-badge ${badgeClass}">${status}</span></td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

function renderBranchExpensesTable(expenses) {
  const tbody = document.getElementById('branchExpensesTableBody');
  if (!tbody) return;

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">No recent expenses logged for this branch.</td></tr>`;
    return;
  }

  const html = expenses.map(e => `
    <tr>
      <td>${UI.formatDate(e.expense_date)}</td>
      <td><span class="badge bg-light text-dark border">${e.category}</span></td>
      <td>${e.description || '—'}</td>
      <td class="text-end fw-semibold">${UI.formatCurrency(e.amount)}</td>
    </tr>
  `).join('');

  tbody.innerHTML = html;
}

function renderBranchReports(reports) {
  const list = document.getElementById('branchReportsList');
  if (!list) return;

  if (reports.length === 0) {
    list.innerHTML = `<li class="activity-item text-muted text-center py-4">No daily operational reports submitted yet.</li>`;
    return;
  }

  const html = reports.map(r => `
    <li class="activity-item">
      <div class="activity-icon bg-light text-primary border">
        <i class="bi bi-file-earmark-text"></i>
      </div>
      <div class="activity-content">
        <div class="activity-title">Daily Report — ${UI.formatDate(r.report_date)}</div>
        <div class="small text-muted mb-1">${r.notes || 'Routine daily operations completed.'}</div>
        <div class="activity-time">Status: <span class="badge bg-success-subtle text-success">${r.status}</span></div>
      </div>
    </li>
  `).join('');

  list.innerHTML = html;
}
