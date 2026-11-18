import { ApiError } from '../../../shared/apiError'
import { withAuthHeader } from '../../../shared/auth/withAuthHeader'
import type { Account } from '../../home/types'
import type { MergeOptions, MergePairPreview, MergePairRequest, MergePairResult, PairIds } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type MergeErrorKind =
  | 'no_family'
  | 'pairs'
  | 'childIds'
  | 'account_deletion_pending'
  | 'forbidden'
  | 'merge_not_allowed'
  | 'unknown'

export class MergeApiError extends ApiError<MergeErrorKind> {}

const KINDS: ReadonlySet<string> = new Set(['no_family', 'pairs', 'childIds', 'account_deletion_pending', 'forbidden', 'merge_not_allowed'])

async function request<T>(path: string, method: 'GET' | 'POST' | 'PUT', token: string | null, payload?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...withAuthHeader(token) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
  if (res.ok) return body as T
  const kind = body.error && KINDS.has(body.error) ? (body.error as MergeErrorKind) : 'unknown'
  throw new MergeApiError(kind, body.message ?? 'Unexpected error')
}

// GET /family/merge-options
export const getMergeOptions = (token: string | null) => request<MergeOptions>('/family/merge-options', 'GET', token)

// POST /family/merges/preview — the pairs travel in the body; nothing changes.
export async function previewMerge(pairs: PairIds[], token: string | null): Promise<MergePairPreview[]> {
  const res = await request<{ pairs: MergePairPreview[] }>('/family/merges/preview', 'POST', token, { pairs })
  return res.pairs
}

// POST /family/merges
export async function mergeChildren(pairs: MergePairRequest[], token: string | null): Promise<MergePairResult[]> {
  const res = await request<{ results: MergePairResult[] }>('/family/merges', 'POST', token, { pairs })
  return res.results
}

// PUT /accounts/{accountId}/hidden-children — replaces the set of hidden children.
export const setHiddenChildren = (accountId: string, childIds: string[], token: string | null) =>
  request<Account>(`/accounts/${accountId}/hidden-children`, 'PUT', token, { childIds })
