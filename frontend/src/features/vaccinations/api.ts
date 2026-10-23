import { ApiError, type ValidationErrorDetail } from '../../shared/apiError'
import { withAuthHeader } from '../../shared/auth/withAuthHeader'
import type { VaccinationInput, VaccinationList, Vaccination, VaccinePhotoList, VaccinePhotoMeta } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type { ValidationErrorDetail }

/** Discriminated error thrown by this feature's api functions. */
export class VaccinationApiError extends ApiError<
  | 'validation_error'
  /** The same vaccine, dose and date are already recorded (409): the parent can confirm. */
  | 'duplicate'
  /** The child already keeps the 10 photos of the card (422 `reason: "vaccine_card"`). */
  | 'photo_limit'
  | 'not_found'
  | 'forbidden'
  | 'unknown'
> {}

interface ErrorBody {
  error?: string
  message?: string
  reason?: string
  details?: ValidationErrorDetail[]
}

function errorFor(status: number, body: ErrorBody, fallback: string): VaccinationApiError {
  const message = body.message ?? fallback
  if (status === 403) return new VaccinationApiError('forbidden', message)
  if (status === 404) return new VaccinationApiError('not_found', message)
  if (status === 400 && body.error === 'validation_error') return new VaccinationApiError('validation_error', message, body.details)
  if (status === 409 && body.error === 'duplicate_vaccination') return new VaccinationApiError('duplicate', message)
  if (status === 422 && body.error === 'photo_limit_exceeded') return new VaccinationApiError('photo_limit', message)
  return new VaccinationApiError('unknown', message)
}

/** One call to the vaccination API. What a parent typed (a vaccine's own name, the lot, the place, the notes) only travels in the JSON body (Principio II). */
async function call<T>(method: string, path: string, token: string | null, body?: unknown, fallback = 'Unexpected error'): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...withAuthHeader(token) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (res.ok) return json as T
  throw errorFor(res.status, json, fallback)
}

/** GET /children/{id}/vaccinations: the doses recorded, the most recent first. */
export const fetchVaccinations = (childId: string, token: string | null) =>
  call<VaccinationList>('GET', `/children/${childId}/vaccinations`, token, undefined, 'Unexpected error fetching the vaccinations')

export const createVaccination = (childId: string, input: VaccinationInput, token: string | null) =>
  call<Vaccination>('POST', `/children/${childId}/vaccinations`, token, input, 'Unexpected error recording the vaccination')

/** PATCH …/{id}: the whole dose is sent and replaces the one saved. */
export const updateVaccination = (childId: string, id: string, input: VaccinationInput, token: string | null) =>
  call<Vaccination>('PATCH', `/children/${childId}/vaccinations/${id}`, token, input, 'Unexpected error correcting the vaccination')

export const deleteVaccination = (childId: string, id: string, token: string | null) =>
  call<void>('DELETE', `/children/${childId}/vaccinations/${id}`, token, undefined, 'Unexpected error deleting the vaccination')

/** GET /children/{id}/vaccine-card-photos: who saved each photo and when; never the images. */
export const fetchPhotos = (childId: string, token: string | null) =>
  call<VaccinePhotoList>('GET', `/children/${childId}/vaccine-card-photos`, token, undefined, 'Unexpected error fetching the photos')

/** GET …/{id}: the image of one photo, as base64. */
export const fetchPhoto = (childId: string, id: string, token: string | null) =>
  call<{ id: string; photoBase64: string }>('GET', `/children/${childId}/vaccine-card-photos/${id}`, token, undefined, 'Unexpected error fetching the photo')

export const uploadPhoto = (childId: string, photoBase64: string, token: string | null) =>
  call<VaccinePhotoMeta>('POST', `/children/${childId}/vaccine-card-photos`, token, { photoBase64 }, 'Unexpected error saving the photo')

export const deletePhoto = (childId: string, id: string, token: string | null) =>
  call<void>('DELETE', `/children/${childId}/vaccine-card-photos/${id}`, token, undefined, 'Unexpected error deleting the photo')
