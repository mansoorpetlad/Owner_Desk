/**
 * OwnerDesk - Executive Dashboard Controller
 * Integrates KPI metrics, interactive Chart.js visualizations, and real-time activity stream
 */

let revenueChartInstance = null;
let branchChartInstance = null;
let inventoryChartInstance = null;
let cachedReportData = null;

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  UI.initSidebar('dashboard');
  setupWelcomeGreeting();
  setupFilterListeners();
  loadDashboardData();
});

function setupWelcomeGreeting() {
  const greetingEl = document.getElementById('welcomeGreeting');
  const dateEl = document.getElementById('welcomeDate');
  if (!greetingEl) return;

  const now = new Date();
  const hour = now.getHours();
  let timeOfDay = 'Morning';
  if (hour >= 12 && hour < 17) timeOfDay = 'Afternoon';
  else if (hour >= 17) timeOfDay = 'Evening';

  const userStr = localStorage.getItem('ownerdesk_user');
  let name = 'Owner';
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      name = u.full_name ? u.full_name.split(' ')[0] : 'Owner';
    } catch (e) {}
  }

  greetingEl.textContent = `Good ${timeOfDay}, ${name}`;

  if (dateEl) {
    dateEl.textContent = new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
  }
}

async function loadDashboardData(periodDays = 30) {
  try {
    // 1. Fetch branches, inventory, reporting, and notifications data safely
    const [branchesRes, invRes, reportRes, notifRes] = await Promise.all([
      apiRequest('/api/branches').catch(e => { console.warn('Branches fetch note:', e.message); return { branches: [] }; }),
      apiRequest('/api/inventory').catch(e => { console.warn('Inventory fetch note:', e.message); return { inventory: [], summary: { in_stock: 0, low_stock: 0, out_of_stock: 0 } }; }),
      apiRequest(`/api/reports/summary`).catch(e => { console.warn('Reports summary note:', e.message); return { financials: { total_revenue: 0, total_expenses: 0, net_revenue: 0 }, trend: [], branch_performance: [] }; }),
      apiRequest('/api/notifications').catch(e => { console.warn('Notifications note:', e.message); return { notifications: [] }; })
    ]);

    const branches = (branchesRes && branchesRes.branches) ? branchesRes.branches : [];
    const inventory = (invRes && invRes.inventory) ? invRes.inventory : [];
    const invSummary = (invRes && invRes.summary) ? invRes.summary : { in_stock: 0, low_stock: 0, out_of_stock: 0 };
    const financials = (reportRes && reportRes.financials) ? reportRes.financials : { total_revenue: 0, total_expenses: 0, net_revenue: 0 };
    cachedReportData = reportRes || {};

    // Check manager unassigned state
    const userStr = localStorage.getItem('ownerdesk_user');
    let userRole = 'owner';
    if (userStr) {
      try { userRole = JSON.parse(userStr).role || 'owner'; } catch (e) {}
    }
    const noBranchAlert = document.getElementById('managerNoBranchAlert');
    if (noBranchAlert) {
      if (userRole === 'manager' && branches.length === 0) {
        noBranchAlert.classList.remove('d-none');
      } else {
        noBranchAlert.classList.add('d-none');
      }
    }

    // 2. Compute 6 KPIs safely
    const totalRev = Number(financials.total_revenue) || 0;
    const totalExp = Number(financials.total_expenses) || 0;
    const netRev = Number(financials.net_revenue) || 0;
    const activeBranchesCount = branches.filter(b => b.status === 'Active').length;
    const lowStockCount = (Number(invSummary.low_stock) || 0) + (Number(invSummary.out_of_stock) || 0);
    const underperformingCount = branches.filter(b => b.status === 'Under-performing' || b.status === 'Out of Stock').length;

    const isManager = userRole === 'manager';
    const primaryBranch = branches[0];
    const branchName = primaryBranch ? primaryBranch.name : 'Branch';

    if (isManager) {
      // Manager role: Scoped to their allocated branch only
      const pageTitle = document.querySelector('.page-title');
      if (pageTitle) pageTitle.textContent = `${branchName} Operations`;

      const greetingEl = document.getElementById('welcomeGreeting');
      if (greetingEl) {
        const u = userStr ? JSON.parse(userStr) : {};
        const uName = u.full_name ? u.full_name.split(' ')[0] : 'Manager';
        greetingEl.textContent = `Good day, ${uName} (${branchName})`;
        const sub = greetingEl.nextElementSibling;
        if (sub) sub.textContent = `Displaying performance and operational metrics for ${branchName}.`;
      }

      renderKPI('kpiTotalRevenue', UI.formatCurrency(totalRev), `${branchName}`, true, `${branchName} Revenue`);
      renderKPI('kpiTotalExpenses', UI.formatCurrency(totalExp), `${branchName}`, false, `${branchName} Expenses`);
      renderKPI('kpiNetRevenue', UI.formatCurrency(netRev), netRev >= 0 ? 'Net Profit' : 'Net Loss', netRev >= 0, `${branchName} Net Profit`);
      renderKPI('kpiActiveBranches', branchName, primaryBranch?.status || 'Active', true, 'Assigned Outlet');
      renderKPI('kpiLowStock', lowStockCount, lowStockCount > 0 ? 'Requires attention' : 'Healthy', lowStockCount === 0, 'Low Stock Items');
      renderKPI('kpiUnderperforming', (primaryBranch?.target_completion || 0) + '%', `Target: ${UI.formatCurrency(primaryBranch?.monthly_target || 0)}`, (primaryBranch?.target_completion || 0) >= 70, 'Target Achievement');

      // Update Chart headers for Manager
      const revChartHeader = document.querySelector('#revenueChart')?.closest('.card-clean')?.querySelector('h6');
      if (revChartHeader) revChartHeader.textContent = `${branchName} Revenue & Expense Trend`;

      const perfChartHeader = document.querySelector('#branchPerformanceChart')?.closest('.card-clean')?.querySelector('h6');
      if (perfChartHeader) perfChartHeader.textContent = `${branchName} Revenue vs Monthly Target`;
    } else {
      // Owner role: Consolidated whole chain view
      renderKPI('kpiTotalRevenue', UI.formatCurrency(totalRev), totalRev > 0 ? 'Whole Chain' : '0%', true, 'Total Chain Revenue');
      renderKPI('kpiTotalExpenses', UI.formatCurrency(totalExp), totalExp > 0 ? 'Whole Chain' : '0%', false, 'Total Chain Expenses');
      renderKPI('kpiNetRevenue', UI.formatCurrency(netRev), netRev > 0 ? 'Chain Net' : '0%', netRev >= 0, 'Net Chain Revenue');
      renderKPI('kpiActiveBranches', `${activeBranchesCount} / ${branches.length}`, branches.length > 0 ? 'Active' : 'No Branches', activeBranchesCount > 0, 'Active Branches');
      renderKPI('kpiLowStock', lowStockCount, lowStockCount > 0 ? 'Requires attention' : 'Healthy', lowStockCount === 0, 'Low Stock Items');
      renderKPI('kpiUnderperforming', underperformingCount, underperformingCount > 0 ? 'Action required' : 'Optimal', underperformingCount === 0, 'Underperforming Outlets');
    }

    // 3. Render Charts
    renderRevenueOverviewChart((reportRes && reportRes.trend) ? reportRes.trend : []);
    renderBranchPerformanceChart((reportRes && reportRes.branch_performance) ? reportRes.branch_performance : []);
    renderInventoryDoughnutChart(invSummary);

    // 4. Render Branch Status Table
    renderBranchStatusList(branches);

    // 5. Render Recent Activities
    renderRecentActivities((notifRes && notifRes.notifications) ? notifRes.notifications : [], branches);

  } catch (err) {
    console.error('Failed to load dashboard metrics:', err);
    UI.showToast('Could not refresh dashboard data. Please check connection.', 'danger');
  }
}

function renderKPI(elementId, value, subtext, isPositive, label = null) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const labelEl = el.querySelector('.kpi-label');
  if (labelEl && label) {
    labelEl.textContent = label;
  }

  const valueEl = el.querySelector('.kpi-value');
  const trendEl = el.querySelector('.kpi-trend');

  if (valueEl) valueEl.textContent = value;
  if (trendEl) {
    trendEl.className = `kpi-trend ${isPositive ? 'trend-up' : 'trend-down'}`;
    trendEl.innerHTML = `<i class="bi ${isPositive ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}"></i> <span>${subtext}</span>`;
  }
}

function renderRevenueOverviewChart(trendData) {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;

  if (revenueChartInstance) {
    revenueChartInstance.destroy();
  }

  const labels = trendData.length > 0
    ? trendData.map(t => UI.formatDate(t.date))
    : ['Week 1', 'Week 2', 'Week 3', 'Week 4'];

  const revSeries = trendData.length > 0 ? trendData.map(t => t.revenue) : [45000, 52000, 68000, 71000];
  const expSeries = trendData.length > 0 ? trendData.map(t => t.expenses) : [21000, 24000, 28000, 31000];
  const netSeries = revSeries.map((r, i) => r - expSeries[i]);

  revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Revenue',
          data: revSeries,
          borderColor: '#2563eb',
          backgroundColor: '#eff6ff',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5
        },
        {
          label: 'Expenses',
          data: expSeries,
          borderColor: '#dc2626',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: 'Net Revenue',
          data: netSeries,
          borderColor: '#16a34a',
          backgroundColor: 'transparent',
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, font: { family: 'Inter', size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${UI.formatCurrency(item.raw)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false }
        },
        y: {
          ticks: {
            callback: (v) => '₹' + (v >= 1000 ? (v / 1000) + 'k' : v)
          },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });
}

function renderBranchPerformanceChart(branchList) {
  const ctx = document.getElementById('branchPerformanceChart');
  if (!ctx) return;

  if (branchChartInstance) {
    branchChartInstance.destroy();
  }

  const userStr = localStorage.getItem('ownerdesk_user');
  let userRole = 'owner';
  if (userStr) {
    try { userRole = (JSON.parse(userStr).role || 'owner').toLowerCase(); } catch (e) {}
  }

  if (userRole === 'manager' && branchList.length > 0) {
    const b = branchList[0];
    const target = Number(b.monthly_target) || 0;
    const achieved = Number(b.revenue) || 0;

    branchChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Monthly Target', 'Achieved Revenue'],
        datasets: [{
          label: 'Amount',
          data: [target, achieved],
          backgroundColor: ['#94a3b8', '#2563eb'],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `${item.label}: ${UI.formatCurrency(item.raw)}`
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
    return;
  }

  const labels = branchList.map(b => b.name);
  const revenues = branchList.map(b => b.revenue || 0);

  branchChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['No Outlets'],
      datasets: [{
        label: 'Revenue',
        data: revenues.length > 0 ? revenues : [0],
        backgroundColor: '#3b82f6',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => `Revenue: ${UI.formatCurrency(item.raw)}`
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

function renderInventoryDoughnutChart(summary) {
  const ctx = document.getElementById('inventoryStatusChart');
  if (!ctx) return;

  if (inventoryChartInstance) {
    inventoryChartInstance.destroy();
  }

  const inStock = summary.in_stock || 0;
  const lowStock = summary.low_stock || 0;
  const outOfStock = summary.out_of_stock || 0;

  inventoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['In Stock', 'Low Stock', 'Out of Stock'],
      datasets: [{
        data: [inStock, lowStock, outOfStock],
        backgroundColor: ['#16a34a', '#d97706', '#dc2626'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { family: 'Inter', size: 12 } }
        }
      }
    }
  });
}

function renderBranchStatusList(branches) {
  const container = document.getElementById('branchStatusList');
  if (!container) return;

  if (branches.length === 0) {
    container.innerHTML = `<div class="p-4 text-center text-muted">No branches created yet.</div>`;
    return;
  }

  const html = branches.map(b => {
    let badgeClass = 'badge-active';
    let statusText = b.status || 'Active';

    if (statusText === 'Under-performing') badgeClass = 'badge-underperforming';
    else if (statusText === 'Out of Stock') badgeClass = 'badge-out-of-stock';

    return `
      <div class="d-flex align-items-center justify-content-between p-3 border-bottom">
        <div>
          <div class="fw-semibold text-dark">${b.name}</div>
          <div class="small text-muted">${b.city}, ${b.state} • Code: ${b.code}</div>
        </div>
        <div class="text-end">
          <span class="status-badge ${badgeClass} mb-1">${statusText}</span>
          <div class="small text-muted">Target: ${b.target_completion || 0}%</div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

function renderRecentActivities(notifications, branches) {
  const container = document.getElementById('recentActivityList');
  if (!container) return;

  if (notifications.length === 0) {
    container.innerHTML = `
      <li class="activity-item text-muted text-center py-4">
        No recent operational alerts or activity.
      </li>
    `;
    return;
  }

  const html = notifications.slice(0, 6).map(n => {
    let iconClass = 'bi-bell-fill text-primary bg-primary-light';
    if (n.severity === 'critical') iconClass = 'bi-exclamation-octagon-fill text-danger bg-danger-subtle';
    else if (n.severity === 'warning') iconClass = 'bi-exclamation-triangle-fill text-warning bg-warning-subtle';
    else if (n.severity === 'success') iconClass = 'bi-check-circle-fill text-success bg-success-subtle';

    const branchName = n.branches ? n.branches.name : 'All Outlets';

    return `
      <li class="activity-item">
        <div class="activity-icon ${iconClass}">
          <i class="bi ${iconClass.split(' ')[0]}"></i>
        </div>
        <div class="activity-content">
          <div class="activity-title">${n.title}</div>
          <div class="small text-muted mb-1">${n.message}</div>
          <div class="activity-time">${branchName} • ${UI.formatTimeAgo(n.created_at)}</div>
        </div>
      </li>
    `;
  }).join('');

  container.innerHTML = html;
}

function setupFilterListeners() {
  const filterBtns = document.querySelectorAll('.revenue-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterBtns.forEach(b => b.classList.remove('active', 'btn-primary'));
      filterBtns.forEach(b => b.classList.add('btn-outline-secondary'));

      btn.classList.add('active', 'btn-primary');
      btn.classList.remove('btn-outline-secondary');

      const days = parseInt(btn.dataset.days) || 30;
      loadDashboardData(days);
    });
  });
}
