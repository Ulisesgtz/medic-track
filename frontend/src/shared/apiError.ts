export interface ValidationErrorDetail {
  field: string
  message: string
}

/**
 * Base class for a discriminated API error: callers branch on `.kind`.
 * Each feature's api.ts defines its own subclass with the exact set of
 * `Kind` values its endpoints can return, instead of duplicating this
 * constructor/`details` shape per feature.
 */
export class ApiError<Kind extends string> extends Error {
  kind: Kind
  details?: ValidationErrorDetail[]

  constructor(kind: Kind, message: string, details?: ValidationErrorDetail[]) {
    super(message)
    this.kind = kind
    this.details = details
  }
}
