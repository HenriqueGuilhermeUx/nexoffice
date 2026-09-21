import * as SecureStore from 'expo-secure-store';

export type Workspace = {
  id: string;
  name: string;
  slug?: string;
  vertical?: string;
  plan?: string;
  status?: string;
  role?: string;
  permissions?: string[];
};

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.nexoffices.com.br';
const TOKEN_KEY = 'nexoffice.mobile.token';
const WORKSPACE_KEY = 'nexoffice.mobile.workspace';

let token = '';
let workspaceId = '';

export async function hydrateSession() {
  token = (await SecureStore.getItemAsync(TOKEN_KEY)) || '';
  workspaceId = (await SecureStore.getItemAsync(WORKSPACE_KEY)) || '';
  return { token, workspaceId };
}

export function getSession() {
  return { token, workspaceId };
}

export async function setSession(nextToken: string, nextWorkspaceId?: string) {
  token = nextToken;
  await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
  if (nextWorkspaceId) await setWorkspace(nextWorkspaceId);
}

export async function setWorkspace(id: string) {
  workspaceId = id;
  await SecureStore.setItemAsync(WORKSPACE_KEY, id);
}

export async function clearSession() {
  token = '';
  workspaceId = '';
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(WORKSPACE_KEY),
  ]);
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (workspaceId) headers.set('x-workspace-id', workspaceId);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body?.message || body?.error || `HTTP ${response.status}`;
    const error = new Error(message) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = body?.error;
    throw error;
  }

  return body as T;
}

export const post = <T = unknown>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const patch = <T = unknown>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const put = <T = unknown>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
