import type { Invoice } from '../types';
import { getAuthHeaders } from './auth';

const QBO_SERVER = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001';

export async function getQBOStatus(): Promise<{ connected: boolean }> {
  const resp = await fetch(`${QBO_SERVER}/api/qbo/status`, { headers: { ...getAuthHeaders() } });
  if (!resp.ok) throw new Error(`QBO status check failed: ${resp.status}`);
  return resp.json();
}

export async function pushInvoiceToQBO(
  invoice: Invoice,
  clientAddress?: string
): Promise<{ qboInvoiceId: string; qboCustomerId: string; qboDocNumber: string }> {
  const resp = await fetch(`${QBO_SERVER}/api/qbo/push-invoice`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body:    JSON.stringify({ invoice, clientAddress }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Push failed: ${resp.status}`);
  }
  return resp.json();
}

export async function syncFromQBO(
  qboInvoiceIds: string[]
): Promise<Record<string, { qboStatus: string; balance: number }>> {
  const resp = await fetch(`${QBO_SERVER}/api/qbo/sync`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body:    JSON.stringify({ qboInvoiceIds }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Sync failed: ${resp.status}`);
  }
  return resp.json();
}

export async function disconnectQBO(): Promise<void> {
  const resp = await fetch(`${QBO_SERVER}/api/qbo/disconnect`, {
    method:  'POST',
    headers: { ...getAuthHeaders() },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Disconnect failed: ${resp.status}`);
  }
}
