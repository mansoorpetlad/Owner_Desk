/**
 * OwnerDesk - Reports & Financial Analytics Controller
 * Generates consolidated P&L statements, branch performance, and CSV exports
 */

let reportData = null;
let trendChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  UI.initSidebar('reports');
  setupReportFilterListeners();
  await loadBranchesDropdown();
  await loadReports();
});

async function loadBranchesDropdown() {
  try {
    const res = await apiRequest('/api/branches');
    const branches = res.branches || [];
    const userStr = localStorage.getItem('ownerdesk_user');
    let userRole = 'owner';
    if (userStr) {
      try { userRole = (JSON.parse(userStr).role || 'owner').toLowerCase(); } catch (e) {}
    }

    const filterSelect = document.getElementById('reportBranchFilter');
    if (filterSelect) {
      const options = branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
      if (userRole === 'manager' && branches.length > 0) {
        filterSelect.innerHTML = options;
        filterSelect.value = branches[0].id;
        filterSelect.disabled = true;
      } else {
        filterSelect.innerHTML = `<option value="all">All Outlets</option>` + options;
      }
    }
  } catch (e) {
    console.error('Failed to load branches dropdown:', e);
  }
}

async function loadReports() {
  try {
    const branch = document.getElementById('reportBranchFilter')?.value || 'all';
    const startDate = document.getElementById('reportStartDate')?.value || '';
    const endDate = document.getElementById('reportEndDate')?.value || '';

    let url = `/api/reports/summary?branch_id=${branch}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;

    reportData = await apiRequest(url);
    renderFinancialSummary(reportData.financials || {});
    renderBranchPerformanceTable(reportData.branch_performance || []);
    renderTrendChart(reportData.trend || []);
  } catch (err) {
    console.error('Failed to load reports:', err);
    UI.showToast('Could not load reports: ' + err.message, 'danger');
  }
}

function renderFinancialSummary(fin) {
  document.getElementById('repTotalRevenue').textContent = UI.formatCurrency(fin.total_revenue);
  document.getElementById('repTotalExpenses').textContent = UI.formatCurrency(fin.total_expenses);
  document.getElementById('repNetRevenue').textContent = UI.formatCurrency(fin.net_revenue);
  document.getElementById('repTotalOrders').textContent = UI.formatNumber(fin.total_orders);
  document.getElementById('repAvgOrderValue').textContent = UI.formatCurrency(fin.avg_order_value);
  document.getElementById('repProfitMargin').textContent = `${fin.profit_margin || 0}%`;
}

function renderBranchPerformanceTable(branches) {
  const tbody = document.getElementById('repBranchPerformanceTableBody');
  if (!tbody) return;

  if (branches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No branch performance data found for selected period.</td></tr>`;
    return;
  }

  const html = branches.map(b => {
    let badgeClass = 'badge-active';
    if (b.status === 'Under-performing') badgeClass = 'badge-underperforming';
    else if (b.status === 'Out of Stock') badgeClass = 'badge-out-of-stock';

    return `
      <tr>
        <td class="fw-semibold">${b.name}</td>
        <td>${b.city}</td>
        <td class="fw-medium">${UI.formatCurrency(b.revenue)}</td>
        <td class="text-muted">${UI.formatCurrency(b.monthly_target)}</td>
        <td>
          <div class="fw-bold">${b.target_completion}%</div>
        </td>
        <td class="text-danger">${UI.formatCurrency(b.expenses)}</td>
        <td class="fw-bold text-success">${UI.formatCurrency(b.net_revenue)}</td>
        <td><span class="status-badge ${badgeClass}">${b.status || 'Active'}</span></td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = html;
}

function renderTrendChart(trend) {
  const ctx = document.getElementById('reportTrendChart');
  if (!ctx) return;

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  const labels = trend.map(t => UI.formatDate(t.date));
  const revenues = trend.map(t => t.revenue);
  const expenses = trend.map(t => t.expenses);

  trendChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['Day 1', 'Day 2', 'Day 3', 'Day 4'],
      datasets: [
        {
          label: 'Revenue',
          data: revenues.length > 0 ? revenues : [50000, 60000, 55000, 70000],
          backgroundColor: '#2563eb',
          borderRadius: 4
        },
        {
          label: 'Expenses',
          data: expenses.length > 0 ? expenses : [20000, 22000, 21000, 25000],
          backgroundColor: '#dc2626',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { family: 'Inter', size: 12 } } },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${UI.formatCurrency(item.raw)}`
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

function setupReportFilterListeners() {
  const branchFilter = document.getElementById('reportBranchFilter');
  const startDate = document.getElementById('reportStartDate');
  const endDate = document.getElementById('reportEndDate');
  const exportBtn = document.getElementById('exportReportCsvBtn');

  if (branchFilter) branchFilter.addEventListener('change', loadReports);
  if (startDate) startDate.addEventListener('change', loadReports);
  if (endDate) endDate.addEventListener('change', loadReports);

  if (exportBtn) {
    exportBtn.addEventListener('click', exportPerformanceToCSV);
  }
}

function exportPerformanceToCSV() {
  if (!reportData || !reportData.branch_performance || reportData.branch_performance.length === 0) {
    UI.showToast('No report data available to export.', 'warning');
    return;
  }

  const headers = ['Branch', 'City', 'Revenue', 'Target', 'Completion %', 'Expenses', 'Net Revenue', 'Status'];
  const rows = reportData.branch_performance.map(b => [
    `"${b.name}"`,
    `"${b.city}"`,
    b.revenue,
    b.monthly_target,
    b.target_completion,
    b.expenses,
    b.net_revenue,
    `"${b.status}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `ownerdesk_performance_report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}
