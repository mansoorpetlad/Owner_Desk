/**
 * OwnerDesk - Notifications & Operational Alerts Controller
 */

let allNotifications = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  UI.initSidebar('notifications');
  setupNotificationListeners();
  loadNotifications();
});

async function loadNotifications() {
  const listEl = document.getElementById('notificationsList');
  if (listEl) {
    listEl.innerHTML = `<li class="activity-item text-center py-4"><span class="spinner-border spinner-border-sm text-primary me-2"></span>Loading alerts...</li>`;
  }

  try {
    const res = await apiRequest('/api/notifications');
    allNotifications = res.notifications || [];
    renderNotifications();
    UI.refreshNotificationBadge();
  } catch (err) {
    console.error('Failed to load notifications:', err);
    UI.showToast('Could not load notifications: ' + err.message, 'danger');
  }
}

function renderNotifications() {
  const listEl = document.getElementById('notificationsList');
  const countBadge = document.getElementById('notifTotalBadge');

  if (!listEl) return;

  let filtered = allNotifications;
  if (currentFilter === 'unread') {
    filtered = allNotifications.filter(n => !n.is_read);
  } else if (currentFilter === 'critical') {
    filtered = allNotifications.filter(n => n.severity === 'critical');
  }

  if (countBadge) {
    countBadge.textContent = `${filtered.length} Alerts`;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-bell-slash empty-state-icon"></i>
        <div class="empty-state-title">No notifications</div>
        <div class="empty-state-description">Everything across your restaurant outlets is operating smoothly without active alerts.</div>
      </div>
    `;
    return;
  }

  const html = filtered.map(n => {
    let icon = 'bi-bell-fill text-primary bg-primary-light';
    let badgeClass = 'badge-info';

    if (n.severity === 'critical') {
      icon = 'bi-exclamation-octagon-fill text-danger bg-danger-subtle';
      badgeClass = 'badge-critical';
    } else if (n.severity === 'warning') {
      icon = 'bi-exclamation-triangle-fill text-warning bg-warning-subtle';
      badgeClass = 'badge-underperforming';
    } else if (n.severity === 'success') {
      icon = 'bi-check-circle-fill text-success bg-success-subtle';
      badgeClass = 'badge-active';
    }

    const unreadIndicator = !n.is_read ? '<span class="badge bg-primary ms-2" style="font-size: 0.65rem;">NEW</span>' : '';
    const branchName = n.branches ? n.branches.name : 'All Outlets';

    return `
      <li class="activity-item p-3 border-bottom ${!n.is_read ? 'bg-light bg-opacity-50' : ''}">
        <div class="activity-icon ${icon} me-3">
          <i class="bi ${icon.split(' ')[0]}"></i>
        </div>
        <div class="activity-content">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <div class="activity-title mb-0">
              ${n.title} ${unreadIndicator}
            </div>
            <span class="status-badge ${badgeClass}">${n.type}</span>
          </div>
          <div class="text-secondary small mb-2">${n.message}</div>
          <div class="d-flex align-items-center justify-content-between">
            <span class="activity-time text-muted small">${branchName} • ${UI.formatTimeAgo(n.created_at)}</span>
            <div class="btn-group btn-group-sm">
              ${!n.is_read ? `
                <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="markNotificationRead('${n.id}')">
                  Mark as Read
                </button>
              ` : ''}
              <button class="btn btn-sm btn-outline-secondary text-danger py-0 px-2" onclick="deleteNotification('${n.id}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </li>
    `;
  }).join('');

  listEl.innerHTML = html;
}

function setupNotificationListeners() {
  const markAllBtn = document.getElementById('markAllReadBtn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      try {
        await apiRequest('/api/notifications/read-all', { method: 'PUT' });
        UI.showToast('All notifications marked as read.', 'success');
        await loadNotifications();
      } catch (e) {
        UI.showToast('Failed to mark all as read.', 'danger');
      }
    });
  }

  const filterBtns = document.querySelectorAll('.notif-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active', 'btn-primary'));
      filterBtns.forEach(b => b.classList.add('btn-outline-secondary'));

      btn.classList.add('active', 'btn-primary');
      btn.classList.remove('btn-outline-secondary');

      currentFilter = btn.dataset.filter;
      renderNotifications();
    });
  });
}

async function markNotificationRead(id) {
  try {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PUT' });
    const notif = allNotifications.find(n => n.id === id);
    if (notif) notif.is_read = true;
    renderNotifications();
    UI.refreshNotificationBadge();
  } catch (err) {
    UI.showToast('Failed to update alert.', 'danger');
  }
}

async function deleteNotification(id) {
  try {
    await apiRequest(`/api/notifications/${id}`, { method: 'DELETE' });
    allNotifications = allNotifications.filter(n => n.id !== id);
    renderNotifications();
    UI.refreshNotificationBadge();
  } catch (err) {
    UI.showToast('Failed to delete alert.', 'danger');
  }
}
