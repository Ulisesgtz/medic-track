import { withAuthHeader } from '../../shared/auth/withAuthHeader'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

// specs/070 (contracts/api.md): deleting the account and downloading all its data. Nothing of the account travels in an address
// besides its id; the confirmation word goes in the body.

/** What asking for the deletion answered. */
export interface DeletionRequested {
  status: 'pending'
  requestedAt: string
  scheduledFor: string
  subscriptionCanceled: boolean
  familyNotified: number
}

/** Why asking for the deletion failed. */
export type DeletionFailure = 'confirm' | 'subscription' | 'pending' | 'unknown'

export class DeletionError extends Error {
  readonly kind: DeletionFailure

  constructor(kind: DeletionFailure) {
    super(kind)
    this.kind = kind
  }
}

/** Whether a 403 body is Clerk's «verify it's you» (`clerk_error.reason === 'reverification-error'`). */
function isReverificationHint(body: unknown): boolean {
  const reason = (body as { clerk_error?: { reason?: unknown } } | null)?.clerk_error?.reason
  return reason === 'reverification-error'
}

/**
 * POST /accounts/{id}/deletion. Clerk's «verify it's you» answer (403 with `clerk_error.reason` `reverification-error`) is RETURNED, not thrown: that is
 * what `useReverification` of @clerk/react looks for to ask for the password or code and call this again.
 */
export async function requestDeletion(
  accountId: string,
  token: string | null,
  confirm = 'ELIMINAR',
): Promise<DeletionRequested | unknown> {
  const res = await fetch(`${API_BASE_URL}/accounts/${accountId}/deletion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...withAuthHeader(token) },
    body: JSON.stringify({ confirm }),
  })
  const body: unknown = await res.json().catch(() => ({}))
  if (res.ok || (res.status === 403 && isReverificationHint(body))) return body
  // Any other 403 (the account is not the session's, say) is an error like the rest.
  if (res.status === 400) throw new DeletionError('confirm')
  if (res.status === 409) throw new DeletionError('pending')
  if (res.status === 502) throw new DeletionError('subscription')
  throw new DeletionError('unknown')
}

/** POST /accounts/{id}/deletion/cancel (idempotent). */
export async function cancelDeletion(accountId: string, token: string | null): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/accounts/${accountId}/deletion/cancel`, {
    method: 'POST',
    headers: withAuthHeader(token),
  })
  if (!res.ok) throw new DeletionError('unknown')
}

/** A downloaded file: its bytes and the name the server gave it. */
export interface DownloadedFile {
  blob: Blob
  name: string
}

function fileName(res: Response, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')
  return match?.[1] ?? fallback
}

async function download(path: string, token: string | null): Promise<DownloadedFile> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: withAuthHeader(token),
  })
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  // A download cut half way rejects here (the server closes the connection): never a short file that looks complete.
  const blob = await res.blob()
  return { blob, name: fileName(res, 'peditrack-datos.zip') }
}

/** POST /accounts/{id}/data-export: everything the account recorded, as a ZIP (any plan). */
export function downloadMyData(accountId: string, token: string | null): Promise<DownloadedFile> {
  return download(`/accounts/${accountId}/data-export`, token)
}

/** POST /family/children-export: the children of a family whose owner asked to delete her account. */
export function downloadFamilyChildren(token: string | null): Promise<DownloadedFile> {
  return download('/family/children-export', token)
}
