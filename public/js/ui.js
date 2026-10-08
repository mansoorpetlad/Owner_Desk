/**
 * OwnerDesk - Shared UI Components & Helper Utilities
 */

const UI = {
  // Format Indian Currency (₹)
  formatCurrency(value) {
    const num = Number(value) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  },

  // Format general number with Indian comma grouping
  formatNumber(value) {
    const num = Number(value) || 0;
    return new Intl.NumberFormat('en-IN').format(num);
  },

  // Format clean date string (e.g. "12 Oct 2024")
  formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(date);
  },

  // Relative time helper (e.g., "5 mins ago", "Yesterday")
  formatTimeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
    if (diffSec < 172800) return 'Yesterday';
    return this.formatDate(dateString);
  },

  // Dynamic Toast Notification System
  showToast(message, type = 'info', title = '') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container position-fixed top-0 end-0 p-3';
      document.body.appendChild(container);
    }

    let iconClass = 'bi-info-circle-fill text-primary';
    let defaultTitle = 'Notification';

    if (type === 'success') {
      iconClass = 'bi-check-circle-fill text-success';
      defaultTitle = 'Success';
    } else if (type === 'danger' || type === 'error') {
      iconClass = 'bi-exclamation-triangle-fill text-danger';
      defaultTitle = 'Error';
    } else if (type === 'warning') {
      iconClass = 'bi-exclamation-circle-fill text-warning';
      defaultTitle = 'Warning';
    }

    const toastId = 'toast_' + Date.now();
    const toastHtml = `
      <div id="${toastId}" class="toast toast-custom mb-2" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="toast-header border-bottom-0 pb-1">
          <i class="bi ${iconClass} me-2 fs-6"></i>
          <strong class="me-auto text-dark">${title || defaultTitle}</strong>
          <small class="text-muted">Just now</small>
          <button type="button" class="btn-close ms-2 mb-1" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body pt-0 text-muted">
          ${message}
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', toastHtml);
    const toastEl = document.getElementById(toastId);
    const bsToast = new bootstrap.Toast(toastEl, { delay: 4000 });
    bsToast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  },

  // Button Loading State
  setButtonLoading(btn, isLoading, originalHtml = '', loadingText = 'Processing...') {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${loadingText}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = originalHtml || btn.dataset.originalHtml || 'Submit';
    }
  },

  // Confirmation Modal
  showConfirmModal({ title, message, confirmBtnText = 'Confirm', isDanger = true, onConfirm }) {
    let modalEl = document.getElementById('globalConfirmModal');
    if (!modalEl) {
      const html = `
        <div class="modal fade" id="globalConfirmModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow">
              <div class="modal-header border-bottom-0 pb-0">
                <h5 class="modal-title fw-bold" id="confirmModalTitle">Confirm Action</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body py-3" id="confirmModalBody">
                Are you sure you want to proceed?
              </div>
              <div class="modal-footer border-top-0 pt-0">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn" id="confirmModalSubmitBtn">Confirm</button>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
      modalEl = document.getElementById('globalConfirmModal');
    }

    document.getElementById('confirmModalTitle').textContent = title || 'Confirm Action';
    document.getElementById('confirmModalBody').textContent = message || 'Are you sure?';

    const submitBtn = document.getElementById('confirmModalSubmitBtn');
    submitBtn.textContent = confirmBtnText;
    submitBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';

    const bsModal = new bootstrap.Modal(modalEl);

    // Remove previous listeners
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

    newSubmitBtn.addEventListener('click', async () => {
      bsModal.hide();
      if (typeof onConfirm === 'function') {
        await onConfirm();
      }
    });

    bsModal.show();
  },

  // Setup Sidebar, Active Navigation, and Profile Dropdown
  initSidebar(activeNavKey) {
    const sidebarEl = document.querySelector('.app-sidebar');
    if (!sidebarEl) return;

    // Highlight active link
    const navLinks = sidebarEl.querySelectorAll('.nav-link-item');
    navLinks.forEach(link => {
      if (link.dataset.nav === activeNavKey) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Enforce role-based sidebar visibility (Managers section is strictly for Admin/Owner)
    const userStr = localStorage.getItem('ownerdesk_user');
    let userRole = 'owner';
    if (userStr) {
      try { userRole = (JSON.parse(userStr).role || 'owner').toLowerCase(); } catch (e) {}
    }
    const mgrNav = sidebarEl.querySelector('.nav-link-item[data-nav="managers"]');
    if (mgrNav) {
      mgrNav.style.display = (userRole === 'owner') ? 'flex' : 'none';
    }

    // Mobile sidebar toggle button
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const backdrop = document.querySelector('.sidebar-backdrop');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        sidebarEl.classList.toggle('show');
        if (backdrop) backdrop.classList.toggle('show');
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', () => {
        sidebarEl.classList.remove('show');
        backdrop.classList.remove('show');
      });
    }

    // Populate user profile info in sidebar & topbar
    this.populateUserInfo();
    this.refreshNotificationBadge();
  },

  // Update User Info in UI
  populateUserInfo() {
    const userStr = localStorage.getItem('ownerdesk_user');
    let user = { full_name: 'Restaurant Owner', email: 'owner@ownerdesk.in', role: 'owner' };
    if (userStr) {
      try { user = JSON.parse(userStr); } catch (e) {}
    }

    const nameElements = document.querySelectorAll('.user-name-display');
    const emailElements = document.querySelectorAll('.user-email-display');
    const roleElements = document.querySelectorAll('.user-role-display');
    const avatarElements = document.querySelectorAll('.user-avatar-display');

    nameElements.forEach(el => el.textContent = user.full_name || 'Restaurant Owner');
    emailElements.forEach(el => el.textContent = user.email || 'owner@ownerdesk.in');
    roleElements.forEach(el => el.textContent = (user.role || 'Owner').toUpperCase());

    const initials = (user.full_name || 'Owner')
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    avatarElements.forEach(el => el.textContent = initials || 'OD');
  },

  // Update Notification Badge Counter
  async refreshNotificationBadge() {
    try {
      const data = await apiRequest('/api/notifications');
      const count = data.unread_count || 0;
      const badges = document.querySelectorAll('.notification-unread-count');
      badges.forEach(b => {
        if (count > 0) {
          b.textContent = count > 99 ? '99+' : count;
          b.classList.remove('d-none');
        } else {
          b.classList.add('d-none');
        }
      });
    } catch (e) {
      // Quiet fail if not logged in
    }
  }
};
