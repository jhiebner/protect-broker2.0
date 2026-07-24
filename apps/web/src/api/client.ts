import type {
  BootstrapState,
  DashboardPreferencesInput,
  FarmProfileInput,
  LoginRequest,
  ProtectConnectionInput,
  SetupAdminInput,
} from '@protect-broker/shared';

interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
  };
}

export class ApiClient {
  constructor(private readonly baseUrl = '') {}

  async getBootstrapState(): Promise<BootstrapState> {
    return this.request<BootstrapState>('/api/bootstrap');
  }

  async login(payload: LoginRequest): Promise<LoginResponse> {
    return this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createAdministrator(payload: SetupAdminInput): Promise<void> {
    await this.request('/api/setup/admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async testProtectConnection(payload: ProtectConnectionInput): Promise<{ ok: boolean; message?: string }> {
    return this.request('/api/setup/protect/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async saveProtectConnection(payload: ProtectConnectionInput): Promise<void> {
    await this.request('/api/setup/protect', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async saveFarmProfile(payload: FarmProfileInput): Promise<void> {
    await this.request('/api/setup/farm', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async saveDashboardPreferences(payload: DashboardPreferencesInput): Promise<void> {
    await this.request('/api/setup/dashboard', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async finishSetup(): Promise<void> {
    await this.request('/api/setup/finish', {
      method: 'POST',
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const hasBody = typeof init?.body === 'string' ? init.body.length > 0 : init?.body !== undefined;

    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as
        | { message?: unknown; error?: string }
        | null;

      const rawMessage = errorBody?.message;
      if (typeof rawMessage === 'string' && rawMessage.length > 0) {
        throw new Error(rawMessage);
      }

      if (Array.isArray(rawMessage) && rawMessage.length > 0) {
        const first = rawMessage[0];
        throw new Error(typeof first === 'string' ? first : JSON.stringify(first));
      }

      if (rawMessage && typeof rawMessage === 'object') {
        throw new Error(JSON.stringify(rawMessage));
      }

      throw new Error(errorBody?.error ?? 'Request failed.');
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

export const apiClient = new ApiClient();
