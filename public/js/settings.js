/**
 * OwnerDesk - Settings & Profile Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await Auth.requireAuth();
  if (!isAuthed) return;

  UI.initSidebar('settings');
  populateSettingsForm();
  setupSettingsListeners();
});

function populateSettingsForm() {
  const userStr = localStorage.getItem('ownerdesk_user');
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      document.getElementById('profileFullName').value = u.full_name || '';
      document.getElementById('profileEmail').value = u.email || '';
      document.getElementById('profileRole').value = (u.role || 'Owner').toUpperCase();
    } catch (e) {}
  }
}

function setupSettingsListeners() {
  // Update Profile Form
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('saveProfileBtn');
      const fullName = document.getElementById('profileFullName').value.trim();

      UI.setButtonLoading(saveBtn, true, '', 'Saving...');

      try {
        const client = await initSupabase();
        if (client) {
          const { error } = await client.auth.updateUser({
            data: { full_name: fullName }
          });
          if (error) throw error;
        }

        const userStr = localStorage.getItem('ownerdesk_user');
        if (userStr) {
          const u = JSON.parse(userStr);
          u.full_name = fullName;
          localStorage.setItem('ownerdesk_user', JSON.stringify(u));
        }

        UI.populateUserInfo();
        UI.showToast('Profile updated successfully.', 'success');
      } catch (err) {
        UI.showToast(err.message || 'Failed to update profile.', 'danger');
      } finally {
        UI.setButtonLoading(saveBtn, false);
      }
    });
  }

  // Change Password Form
  const passwordForm = document.getElementById('passwordForm');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('savePasswordBtn');
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmNewPassword').value;

      if (newPassword !== confirmPassword) {
        UI.showToast('Passwords do not match.', 'warning');
        return;
      }

      if (newPassword.length < 6) {
        UI.showToast('Password must be at least 6 characters.', 'warning');
        return;
      }

      UI.setButtonLoading(saveBtn, true, '', 'Updating Password...');

      try {
        const client = await initSupabase();
        if (client) {
          const { error } = await client.auth.updateUser({ password: newPassword });
          if (error) throw error;
          UI.showToast('Password updated successfully.', 'success');
          passwordForm.reset();
        } else {
          UI.showToast('Password updated (local demo mode).', 'success');
          passwordForm.reset();
        }
      } catch (err) {
        UI.showToast(err.message || 'Failed to update password.', 'danger');
      } finally {
        UI.setButtonLoading(saveBtn, false);
      }
    });
  }
}
