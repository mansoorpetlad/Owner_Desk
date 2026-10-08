/**
 * OwnerDesk - Supabase Client Bridge
 * Manages Supabase instance, sessions, and client-side database interaction
 */

let sbClient = null;

// Initialize Supabase Client
async function initSupabase() {
  if (sbClient) return sbClient;

  await OwnerDeskConfig.init();

  if (OwnerDeskConfig.isConfigured && window.supabase) {
    try {
      sbClient = window.supabase.createClient(
        OwnerDeskConfig.supabaseUrl,
        OwnerDeskConfig.supabaseAnonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
          }
        }
      );
      return sbClient;
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
    }
  }

  return null;
}

// Get current session token
async function getAuthToken() {
  const client = await initSupabase();
  if (client) {
    const { data: { session } } = await client.auth.getSession();
    if (session) return session.access_token;
  }
  return localStorage.getItem('ownerdesk_token') || null;
}

// Authenticated fetch wrapper for backend APIs
async function apiRequest(url, options = {}) {
  const token = await getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;

  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errorMessage = (data && data.error) ? data.error : `Request failed with status ${res.status}`;
    throw new Error(errorMessage);
  }

  return data;
}
