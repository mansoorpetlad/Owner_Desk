/**
 * OwnerDesk - Client Configuration Loader
 * Dynamically fetches environment configuration from backend /api/config
 */
const OwnerDeskConfig = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  isConfigured: false,

  async init() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        this.supabaseUrl = data.supabaseUrl;
        this.supabaseAnonKey = data.supabaseAnonKey;
        this.isConfigured = data.isConfigured;
      }
    } catch (err) {
      console.warn('Could not load backend config:', err);
    }
    return this;
  }
};
