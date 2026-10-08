/**
 * OwnerDesk - Authentication Controller
 * Handles Supabase Email/Password authentication, session management, and route protection
 */

const Auth = {
  // Check if current user is logged in
  async getCurrentSession() {
    const client = await initSupabase();
    if (client) {
      const { data: { session }, error } = await client.auth.getSession();
      if (!error && session) {
        return session;
      }
    }
    // Fallback or demo user token check
    const token = localStorage.getItem('ownerdesk_token');
    const user = localStorage.getItem('ownerdesk_user');
    if (token && user) {
      try {
        return { access_token: token, user: JSON.parse(user) };
      } catch (e) {
        return null;
      }
    }
    return null;
  },

  // Protect private dashboard routes
  async requireAuth() {
    const session = await this.getCurrentSession();
    if (!session) {
      const currentPath = window.location.pathname;
      window.location.href = `/login.html?redirect=${encodeURIComponent(currentPath)}`;
      return false;
    }

    // Check if manager is allocated to a branch
    const userStr = localStorage.getItem('ownerdesk_user');
    let userRole = 'owner';
    if (userStr) {
      try { userRole = (JSON.parse(userStr).role || 'owner').toLowerCase(); } catch (e) {}
    }

    if (userRole === 'manager') {
      try {
        const token = session.access_token || localStorage.getItem('ownerdesk_token');
        if (token) {
          const bRes = await fetch('/api/branches', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const bData = await bRes.json();
          if (!bData.branches || bData.branches.length === 0) {
            const client = await initSupabase();
            if (client) await client.auth.signOut();
            localStorage.removeItem('ownerdesk_token');
            localStorage.removeItem('ownerdesk_user');
            window.location.href = `/login.html?error=${encodeURIComponent('You are not assigned to any branch')}`;
            return false;
          }
        }
      } catch (err) {
        console.warn('Branch allocation check error:', err);
      }
    }

    return true;
  },

  // Redirect away from login/register if already logged in
  async redirectIfAuthenticated() {
    const session = await this.getCurrentSession();
    if (session) {
      // For managers, verify branch allocation before redirecting to dashboard
      const userStr = localStorage.getItem('ownerdesk_user');
      let userRole = 'owner';
      if (userStr) {
        try { userRole = (JSON.parse(userStr).role || 'owner').toLowerCase(); } catch (e) {}
      }

      if (userRole === 'manager') {
        const token = session.access_token || localStorage.getItem('ownerdesk_token');
        if (token) {
          try {
            const bRes = await fetch('/api/branches', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const bData = await bRes.json();
            if (!bData.branches || bData.branches.length === 0) {
              const client = await initSupabase();
              if (client) await client.auth.signOut();
              localStorage.removeItem('ownerdesk_token');
              localStorage.removeItem('ownerdesk_user');
              return false;
            }
          } catch (e) {
            return false;
          }
        }
      }

      window.location.href = '/dashboard.html';
      return true;
    }
    return false;
  },

  // Register New Owner
  async signUp(fullName, email, password, confirmPassword) {
    if (!fullName || !email || !password) {
      throw new Error('Please fill in all required fields.');
    }
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const client = await initSupabase();

    if (client) {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: 'owner'
          }
        }
      });

      if (error) {
        if (error.message.includes('already registered')) {
          throw new Error('An account with this email address already exists.');
        }
        throw new Error(error.message || 'Registration failed. Please check your inputs.');
      }

      // Store cached user info
      if (data && data.user) {
        const userInfo = {
          id: data.user.id,
          email: data.user.email,
          full_name: fullName.trim(),
          role: 'owner'
        };
        localStorage.setItem('ownerdesk_user', JSON.stringify(userInfo));

        if (data.session) {
          localStorage.setItem('ownerdesk_token', data.session.access_token);
        } else {
          // If Supabase didn't issue session directly on signup, sign in immediately without verification
          try {
            const { data: loginData } = await client.auth.signInWithPassword({
              email: email.trim(),
              password: password
            });
            if (loginData?.session) {
              localStorage.setItem('ownerdesk_token', loginData.session.access_token);
            }
          } catch (e) {
            console.log('Auto sign-in fallback handled');
          }
        }
      }
      return data;
    } else {
      // Local demo mode if Supabase keys not filled in .env
      const demoUser = {
        id: '00000000-0000-0000-0000-000000000001',
        email: email.trim(),
        full_name: fullName.trim(),
        role: 'owner'
      };
      localStorage.setItem('ownerdesk_token', 'demo_token_' + Date.now());
      localStorage.setItem('ownerdesk_user', JSON.stringify(demoUser));
      return { user: demoUser };
    }
  },

  // Log in existing user (Accepts Email Address OR Manager ID)
  async signIn(identifier, password) {
    if (!identifier || !password) {
      throw new Error('Please enter both email/Manager ID and password.');
    }

    const cleanId = identifier.trim();
    let emailToUse = cleanId;

    // If identifier is not an email (e.g. MGR-1, MGR-101), look up the associated email
    if (!cleanId.includes('@')) {
      try {
        const lookupRes = await fetch(`/api/managers/lookup-email?identifier=${encodeURIComponent(cleanId)}`);
        const lookupData = await lookupRes.json();
        if (!lookupRes.ok) {
          throw new Error(lookupData.error || `No account found with Manager ID: ${cleanId}`);
        }
        if (lookupData.email) {
          emailToUse = lookupData.email;
        }
      } catch (err) {
        throw new Error(err.message || `No account found with Manager ID: ${cleanId}`);
      }
    }

    const client = await initSupabase();

    if (client) {
      const { data, error } = await client.auth.signInWithPassword({
        email: emailToUse,
        password: password
      });

      if (error) {
        if (error.message.includes('banned') || error.message.includes('suspended')) {
          throw new Error('This manager account has been disabled by the owner. Please contact your administrator.');
        }
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Invalid email or password. Please try again.');
        }
        throw new Error(error.message || 'Login failed. Please verify credentials.');
      }

      if (data && data.user) {
        // Verify manager account is not marked as disabled in metadata
        if (data.user.user_metadata?.status === 'Disabled') {
          await client.auth.signOut();
          throw new Error('This manager account has been disabled by the owner. Please contact your administrator.');
        }

        const role = (data.user.user_metadata?.role || 'owner').toLowerCase();

        // If user is a manager, verify that they are allocated to a branch
        if (role === 'manager') {
          const token = data.session ? data.session.access_token : null;
          if (token) {
            const bRes = await fetch('/api/branches', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const bData = await bRes.json();
            if (!bData.branches || bData.branches.length === 0) {
              await client.auth.signOut();
              localStorage.removeItem('ownerdesk_token');
              localStorage.removeItem('ownerdesk_user');
              throw new Error('You are not assigned to any branch');
            }
          }
        }

        const fullName = data.user.user_metadata?.full_name || (data.user.email || emailToUse).split('@')[0];
        const userInfo = {
          id: data.user.id,
          email: data.user.email,
          full_name: fullName,
          role: role
        };
        localStorage.setItem('ownerdesk_user', JSON.stringify(userInfo));
        if (data.session) {
          localStorage.setItem('ownerdesk_token', data.session.access_token);
        }
      }
      return data;
    } else {
      // Fallback demo login
      const demoUser = {
        id: '00000000-0000-0000-0000-000000000001',
        email: email.trim(),
        full_name: 'Demo Owner',
        role: 'owner'
      };
      localStorage.setItem('ownerdesk_token', 'demo_token_' + Date.now());
      localStorage.setItem('ownerdesk_user', JSON.stringify(demoUser));
      return { user: demoUser };
    }
  },

  // Log out current session
  async signOut() {
    try {
      const client = await initSupabase();
      if (client) {
        await client.auth.signOut();
      }
    } catch (e) {
      console.warn('Sign out warning:', e);
    } finally {
      localStorage.removeItem('ownerdesk_token');
      localStorage.removeItem('ownerdesk_user');
      window.location.href = '/login.html';
    }
  }
};
