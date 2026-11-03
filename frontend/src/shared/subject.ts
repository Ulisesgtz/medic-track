import type { Account } from '../features/home/types'
import { childAccessOf, type ChildAccess } from '../features/family/useChildAccess'

/**
 * Whose health a screen is about (specs/058-consultas-del-titular): a child of the family, or the person of an account
 * themself (their own consultations). The consultation screens, the history and the PDF take one; a plain string is a child's
 * id, so the screens of a child keep working as they were.
 */
export type Subject = { kind: 'child'; childId: string } | { kind: 'person'; accountId: string }
export type SubjectRef = string | Subject

export function toSubject(ref: SubjectRef): Subject {
  return typeof ref === 'string' ? { kind: 'child', childId: ref } : ref
}

/** The API's base path of the subject: `/children/{id}` or `/accounts/{id}`. */
export function apiBase(ref: SubjectRef): string {
  const s = toSubject(ref)
  return s.kind === 'child' ? `/children/${s.childId}` : `/accounts/${s.accountId}`
}

/** A cache key part: the child's id as before, `person:{id}` for a person. */
export function subjectKey(ref: SubjectRef): string {
  const s = toSubject(ref)
  return s.kind === 'child' ? s.childId : `person:${s.accountId}`
}

/** Where the subject's page is: the child's detail, the session's own profile (`/yo`) or someone's shared one. */
export function subjectHref(ref: SubjectRef, myAccountId: string | undefined): string {
  const s = toSubject(ref)
  if (s.kind === 'child') return `/children/${s.childId}`
  return s.accountId === myAccountId ? '/yo' : `/personas/${s.accountId}`
}

/** «Nueva consulta» of the subject. */
export function newConsultationHref(ref: SubjectRef): string {
  const s = toSubject(ref)
  return s.kind === 'child' ? `/children/${s.childId}/consultations/new` : '/yo/consultas/nueva'
}

/** The history of the subject. */
export function historyHref(ref: SubjectRef, myAccountId: string | undefined): string {
  return `${subjectHref(ref, myAccountId)}/historial`
}

/** A consultation's subject, from its detail: its child, or — with none — the person it belongs to. */
export function subjectOfConsultation(c: { childId: string | null; accountId?: string }): Subject | undefined {
  if (c.childId) return { kind: 'child', childId: c.childId }
  return c.accountId ? { kind: 'person', accountId: c.accountId } : undefined
}

/** Whether a person's own things are on the paid plan: their own account, or the family they belong to (specs/033 part 3). */
export function personalPaid(account: Pick<Account, 'plan' | 'family'>): boolean {
  return account.plan === 'paid' || account.family?.plan === 'paid'
}

/**
 * What the session can do with the subject. A child: its role in the family (specs/032). A person: everything when it is the
 * session itself, on the plan of its own things; somebody else's shared consultations are only seen and marked (a Tutor never
 * edits another adult's), so the screens offer nothing more.
 */
export function subjectAccessOf(account: Account | undefined, ref: SubjectRef | undefined): ChildAccess {
  if (ref === undefined) return childAccessOf(account, undefined)
  const s = toSubject(ref)
  if (s.kind === 'child') return childAccessOf(account, account?.children.find((c) => c.id === s.childId))
  const own = account !== undefined && account.id === s.accountId
  const paid = account !== undefined && personalPaid(account)
  return {
    role: own ? 'owner' : 'caregiver',
    plan: paid ? 'paid' : 'free',
    readOnly: false,
    canAdd: own,
    canMark: true,
    canInvite: false,
    isFree: account !== undefined && !paid,
  }
}
