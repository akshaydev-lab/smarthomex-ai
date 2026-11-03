import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';

// ==============================================================================
// SmartHomeX AI - Supabase Client Integration Service
// Supports Authentication, Realtime Subscriptions, Database CRUD, and Safe Diagnostics
// ==============================================================================

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  isConfigured: boolean;
  projectRef: string | null;
}

export interface SupabaseDiagnosticReport {
  url: string;
  projectRef: string | null;
  keyLength: number;
  keyRole: string | null;
  keyProjectRef: string | null;
  isRefMatched: boolean;
  isOnline: boolean;
  reachabilityStatus: number | null;
  errorCategory: 'NONE' | 'OFFLINE' | 'BLOCKED_BY_EXTENSIONS' | 'DNS_OR_NETWORK' | 'CORS_OR_TLS' | 'HTTP_ERROR';
  latencyMs: number;
  errorMessage?: string;
  rawError?: unknown;
}

const normalizeUrl = (raw: string): string => {
  let trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = `https://${trimmed}.supabase.co`;
  }
  return trimmed.replace(/\/+$/, '');
};

const supabaseUrl = normalizeUrl(import.meta.env.VITE_SUPABASE_URL || '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Extract project ref from URL (e.g. pacejovitiwmoucyzkzy)
export const getProjectRefFromUrl = (url: string): string | null => {
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match ? match[1] : null;
};

// Safely parse public claims from JWT payload without logging token or secret
export const parseJwtClaims = (jwt: string): { ref?: string; role?: string; exp?: number } | null => {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    return {
      ref: parsed.ref,
      role: parsed.role,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
};

const projectRef = getProjectRefFromUrl(supabaseUrl);
const jwtClaims = parseJwtClaims(supabaseAnonKey);

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey.length > 20
);

export const getSupabaseConfig = (): SupabaseConfig => {
  return {
    supabaseUrl,
    supabaseAnonKey: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 8)}...` : '',
    isConfigured: isSupabaseConfigured,
    projectRef,
  };
};

// ==============================================================================
// Safe Diagnostic Connectivity Probe
// Probes https://[ref].supabase.co/auth/v1/health directly to isolate whether a
// "Failed to fetch" error is caused by adblockers, DNS, network drop, or server.
// ==============================================================================
export const diagnoseSupabaseConnectivity = async (): Promise<SupabaseDiagnosticReport> => {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const isRefMatched = Boolean(
    projectRef &&
    jwtClaims?.ref &&
    projectRef.toLowerCase() === jwtClaims.ref.toLowerCase()
  );

  if (!isOnline) {
    return {
      url: supabaseUrl,
      projectRef,
      keyLength: supabaseAnonKey.length,
      keyRole: jwtClaims?.role || null,
      keyProjectRef: jwtClaims?.ref || null,
      isRefMatched,
      isOnline: false,
      reachabilityStatus: null,
      errorCategory: 'OFFLINE',
      latencyMs: 0,
      errorMessage: 'Browser reports offline state (no active internet connection).',
    };
  }

  const healthEndpoint = `${supabaseUrl}/auth/v1/health`;
  const start = Date.now();

  try {
    const response = await fetch(healthEndpoint, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
      },
    });
    const latencyMs = Date.now() - start;

    console.groupCollapsed(`[Supabase Diagnostics] Auth Health Probe: HTTP ${response.status}`);
    console.log('Target Health URL:', healthEndpoint);
    console.log('HTTP Status:', response.status);
    console.log('Latency:', `${latencyMs}ms`);
    console.log('Project Ref Match:', isRefMatched ? 'MATCHED' : 'MISMATCH');
    console.log('API Key Claims:', { role: jwtClaims?.role, ref: jwtClaims?.ref });
    console.groupEnd();

    return {
      url: supabaseUrl,
      projectRef,
      keyLength: supabaseAnonKey.length,
      keyRole: jwtClaims?.role || null,
      keyProjectRef: jwtClaims?.ref || null,
      isRefMatched,
      isOnline: true,
      reachabilityStatus: response.status,
      errorCategory: response.ok ? 'NONE' : 'HTTP_ERROR',
      latencyMs,
      errorMessage: response.ok ? undefined : `Server responded with HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Differentiate between immediate adblocker blocks (< 50ms) and network/DNS drops
    let category: SupabaseDiagnosticReport['errorCategory'] = 'DNS_OR_NETWORK';
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
      if (latencyMs < 50) {
        category = 'BLOCKED_BY_EXTENSIONS';
      } else {
        category = 'DNS_OR_NETWORK';
      }
    }

    console.group('[Supabase Diagnostics] Connectivity Probe Failed');
    console.warn('Target Health URL:', healthEndpoint);
    console.warn('Error Category:', category);
    console.warn('Latency Before Drop:', `${latencyMs}ms`);
    console.warn('Native Error:', errorMsg);
    console.warn(
      'Likely Root Cause:',
      category === 'BLOCKED_BY_EXTENSIONS'
        ? 'Adblocker / Brave Shields / Privacy extension blocked cross-origin request from localhost to *.supabase.co'
        : 'DNS resolution failure, proxy interference, or network firewall drop'
    );
    console.groupEnd();

    return {
      url: supabaseUrl,
      projectRef,
      keyLength: supabaseAnonKey.length,
      keyRole: jwtClaims?.role || null,
      keyProjectRef: jwtClaims?.ref || null,
      isRefMatched,
      isOnline: true,
      reachabilityStatus: null,
      errorCategory: category,
      latencyMs,
      errorMessage: errorMsg,
      rawError: err,
    };
  }
};

// Singleton Supabase Client
let clientInstance: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return clientInstance;
};

// Direct export for standard usage
export const supabase = getSupabaseClient();

// ==============================================================================
// Authentication Helpers with Safe Non-Sensitive Logging
// ==============================================================================

export interface AuthStateChangeCallback {
  (event: string, session: Session | null): void;
}

export const subscribeToAuthChanges = (callback: AuthStateChangeCallback) => {
  const client = getSupabaseClient();
  if (!client) return { unsubscribe: () => { } };

  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return subscription;
};

export const getCurrentSession = async (): Promise<Session | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: { session } } = await client.auth.getSession();
    return session;
  } catch (error) {
    console.error('Error fetching Supabase session:', error);
    return null;
  }
};

export const getCurrentUser = async (): Promise<User | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: { user } } = await client.auth.getUser();
    return user;
  } catch (error) {
    console.error('Error fetching Supabase user:', error);
    return null;
  }
};

export const signUpWithEmail = async (email: string, password: string, fullName?: string) => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
  }

  const endpoint = `${supabaseUrl}/auth/v1/signup`;
  console.groupCollapsed('[Supabase Auth] signUp Request Diagnostics');
  console.log('Target Endpoint:', endpoint);
  console.log('Project Ref:', projectRef);
  console.log('Client State:', {
    isConfigured: isSupabaseConfigured,
    keyLength: supabaseAnonKey.length,
    onLine: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  try {
    const res = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || email.split('@')[0],
        },
      },
    });

    if (res.error) {
      console.warn('[Supabase Auth] signUp returned error:', {
        name: res.error.name,
        status: res.error.status,
        message: res.error.message,
      });
      console.groupEnd();
      return res;
    }

    console.log('[Supabase Auth] signUp completed successfully.');
    console.groupEnd();
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Supabase Auth] signUp threw exception:', message);
    console.groupEnd();
    throw err;
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
  }

  const endpoint = `${supabaseUrl}/auth/v1/token?grant_type=password`;
  console.groupCollapsed('[Supabase Auth] signInWithPassword Request Diagnostics');
  console.log('Target Endpoint:', endpoint);
  console.log('Project Ref:', projectRef);
  console.log('Client State:', {
    isConfigured: isSupabaseConfigured,
    keyLength: supabaseAnonKey.length,
    onLine: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  try {
    const res = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (res.error) {
      console.warn('[Supabase Auth] signInWithPassword returned error:', {
        name: res.error.name,
        status: res.error.status,
        message: res.error.message,
      });
      console.groupEnd();
      return res;
    }

    console.log('[Supabase Auth] signInWithPassword completed successfully. User ID:', res.data.user?.id);
    console.groupEnd();
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Supabase Auth] signInWithPassword threw exception:', message);
    console.groupEnd();
    throw err;
  }
};

export const signOut = async () => {
  const client = getSupabaseClient();
  if (!client) return;

  return await client.auth.signOut();
};

export const resetPasswordForEmail = async (email: string, redirectTo?: string) => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
  }

  return await client.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo || `${window.location.origin}/`,
  });
};

// ==============================================================================
// Realtime Database Channel Subscriptions
// ==============================================================================

export const subscribeToDeviceChanges = (userId: string, onUpdate: (payload: unknown) => void) => {
  const client = getSupabaseClient();
  if (!client) return null;

  return client
    .channel(`public:devices:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'devices',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onUpdate(payload);
      }
    )
    .subscribe();
};

export const subscribeToAlerts = (userId: string, onNewAlert: (payload: unknown) => void) => {
  const client = getSupabaseClient();
  if (!client) return null;

  return client
    .channel(`public:alerts:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'alerts',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNewAlert(payload);
      }
    )
    .subscribe();
};

export const subscribeToSensorReadings = (userId: string, onNewReading: (payload: unknown) => void) => {
  const client = getSupabaseClient();
  if (!client) return null;

  return client
    .channel(`public:sensor_readings:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sensor_readings',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onNewReading(payload);
      }
    )
    .subscribe();
};

export const subscribeToDeviceStatus = (userId: string, onStatusChange: (payload: unknown) => void) => {
  const client = getSupabaseClient();
  if (!client) return null;

  return client
    .channel(`public:device_status:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'device_status',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onStatusChange(payload);
      }
    )
    .subscribe();
};
export const registerSmartHomeDeviceToken = async (
  rawToken: string
) => {
  const client = getSupabaseClient();

  if (!client) {
    throw new Error('Supabase client unavailable');
  }

  const {
    data: { user },
    error: userError
  } = await client.auth.getUser();

  if (userError || !user) {
    throw new Error('Please login first');
  }

  const { data, error } = await client.rpc(
    'register_device_token',
    {
      p_user_id: user.id,
      p_home_id: 'e5ad96e9-d517-42bf-b6c6-94546ed7255e',
      p_device_node_id: 'ESP32-WROOM-32-NODE-01',
      p_raw_token: rawToken
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
