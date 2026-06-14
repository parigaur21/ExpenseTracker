import type { BalanceSummary, BalanceTrace, Expense, Group, ImportReport, Membership, Settlement } from './types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api';

export class ApiClient {
  token = localStorage.getItem('token') ?? '';

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    const response = await fetch(`${API}${path}`, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message ?? 'Request failed');
    }
    return response.json();
  }

  login(email: string, password: string) {
    return this.request<{ token: string; userId: string; displayName: string; email: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password })
    });
  }
  register(displayName: string, username: string, email: string, password: string) {
    return this.request<{ token: string; userId: string; displayName: string; email: string }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ displayName, username, email, password })
    });
  }
  groups() { return this.request<Group[]>('/groups'); }
  createGroup(name: string) { return this.request<Group>('/groups', { method: 'POST', body: JSON.stringify({ name, baseCurrency: 'INR' }) }); }
  memberships(groupId: string) { return this.request<Membership[]>(`/groups/${groupId}/memberships`); }
  expenses(groupId: string) { return this.request<Expense[]>(`/groups/${groupId}/expenses`); }
  settlements(groupId: string) { return this.request<Settlement[]>(`/groups/${groupId}/settlements`); }
  balances(groupId: string) { return this.request<BalanceSummary>(`/groups/${groupId}/balances`); }
  trace(groupId: string, fromUserId: string, toUserId: string) {
    return this.request<BalanceTrace>(`/groups/${groupId}/balances/trace?fromUserId=${fromUserId}&toUserId=${toUserId}`);
  }
  importCsv(groupId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.request<ImportReport>(`/groups/${groupId}/imports/csv`, { method: 'POST', body: form });
  }
}

export const api = new ApiClient();

