import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { Appointment, AppointmentInput, AppointmentOfConsultation, AppointmentsOfChild } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type { ValidationErrorDetail }

/** Discriminated error thrown by this feature's api functions. */
export class AppointmentApiError extends ApiError<
  | 'not_found'
  | 'forbidden'
  | 'validation_error'
  /** The free plan: creating and editing appointments are the paid plan's (422 `reason: "appointments"`). */
  | 'plan_required'
  /** The consultation already has a scheduled appointment (409). */
  | 'exists'
  /** A done or canceled appointment can't be changed that way (409). */
  | 'closed'
  | 'not_scheduled'
  | 'unknown'
> {}

interface ErrorBody {
  error?: string
  message?: string
  reason?: string
  details?: ValidationErrorDetail[]
}

function errorFor(status: number, body: ErrorBody, fallback: string): AppointmentApiError {
  const message = body.message ?? fallback
  if (status === 403) return new AppointmentApiError('forbidden', message)
  if (status === 404) return new AppointmentApiError('not_found', message)
  if (status === 400 && body.error === 'validation_error') return new AppointmentApiError('validation_error', message, body.details)
  if (status === 409 && body.error === 'appointment_exists') return new AppointmentApiError('exists', message)
  if (status === 409 && body.error === 'appointment_closed') return new AppointmentApiError('closed', message)
  if (status === 409 && body.error === 'appointment_not_scheduled') return new AppointmentApiError('not_scheduled', message)
  if (status === 422 && body.error === 'freemium_consultation_limit_exceeded' && body.reason === 'appointments') {
    return new AppointmentApiError('plan_required', message)
  }
  return new AppointmentApiError('unknown', message)
}

/** One call to the appointments API. The note and the date a parent typed only ever travel in the JSON body (Principio II). */
async function call<T>(method: string, path: string, token: string | null, body?: unknown, fallback = 'Unexpected error'): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...withAuthHeader(token) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = await res.json()
  if (res.ok) return json as T
  throw errorFor(res.status, json, fallback)
}

/** GET /children/{id}/appointments: the nearest scheduled appointment and the history of the rest. */
export const fetchChildAppointments = (childId: string, token: string | null) =>
  call<AppointmentsOfChild>('GET', `/children/${childId}/appointments`, token, undefined, 'Unexpected error fetching the appointments')

/** GET /consultations/{id}/appointment: the consultation's scheduled appointment, or none. */
export const fetchConsultationAppointment = (consultationId: string, token: string | null) =>
  call<AppointmentOfConsultation>('GET', `/consultations/${consultationId}/appointment`, token, undefined, 'Unexpected error fetching the appointment')

export const fetchAppointment = (appointmentId: string, token: string | null) =>
  call<Appointment>('GET', `/appointments/${appointmentId}`, token, undefined, 'Unexpected error fetching the appointment')

export const createAppointment = (consultationId: string, input: AppointmentInput, token: string | null) =>
  call<Appointment>('POST', `/consultations/${consultationId}/appointments`, token, input, 'Unexpected error creating the appointment')

export const updateAppointment = (appointmentId: string, input: AppointmentInput, token: string | null) =>
  call<Appointment>('PATCH', `/appointments/${appointmentId}`, token, input, 'Unexpected error updating the appointment')

/** POST /appointments/{id}/status: done, canceled, or scheduled (to take a «done» back). */
export const setAppointmentStatus = (appointmentId: string, status: 'done' | 'canceled' | 'scheduled', token: string | null) =>
  call<Appointment>('POST', `/appointments/${appointmentId}/status`, token, { status }, 'Unexpected error changing the appointment')

/** PUT /appointments/{id}/my-reminders: the session's own reminders of the appointment, on or off. */
export const setAppointmentReminders = (appointmentId: string, enabled: boolean, token: string | null) =>
  call<{ myReminders: boolean }>('PUT', `/appointments/${appointmentId}/my-reminders`, token, { enabled }, 'Unexpected error saving the reminder choice')
