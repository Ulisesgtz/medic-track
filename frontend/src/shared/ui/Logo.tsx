import { useId } from 'react'

export interface LogoProps {
  /** Pixel size of the square icon badge. */
  size?: number
  /** 'dark' for placement on a --color-ink header/splash; 'light' for placement on --color-canvas. */
  variant?: 'dark' | 'light'
  /** Whether to render the "PediTrack" wordmark next to the icon. */
  showWordmark?: boolean
  className?: string
}

const BADGE_BG: Record<'dark' | 'light', string> = {
  dark: '#22d3ee', // --color-bright
  light: '#0e7490', // --color-action
}

const JOINT_COLOR: Record<'dark' | 'light', string> = {
  dark: '#04252b', // --color-ink (matches the dark header/splash behind the badge)
  light: '#f8feff', // --color-canvas (matches the light screen behind the badge)
}

const WORDMARK_PEDI: Record<'dark' | 'light', string> = {
  dark: '#ffffff',
  light: '#04252b', // --color-ink
}

const WORDMARK_TRACK: Record<'dark' | 'light', string> = {
  dark: '#67e8f9',
  light: '#0e7490', // --color-action
}

/**
 * PediTrack's mark: a pill rotated -45°, split in half (white / emerald,
 * the "confirmed dose" color) with the joint colored to match whatever it
 * sits on. Belongs to `shared/ui` because both the signup screen and the
 * app header consume it (specs/005-identidad-visual-front-end/design-tokens.md).
 * Appears only in the header, the signup screen, and the PWA icon/splash —
 * never repeated inside a screen's own content.
 */
export function Logo({ size = 40, variant = 'dark', showWordmark = true, className }: LogoProps) {
  const clipId = useId()

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="PediTrack">
        <rect width="64" height="64" rx="15" fill={BADGE_BG[variant]} />
        <g transform="translate(32 32) rotate(-45) translate(-11 -27)">
          <clipPath id={clipId}>
            <rect x="0" y="0" width="22" height="54" rx="11" />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            <rect x="0" y="0" width="22" height="54" fill="#ffffff" />
            <rect x="0" y="27" width="22" height="27" fill="#047857" />
            <rect x="0" y="25.5" width="22" height="3" fill={JOINT_COLOR[variant]} />
          </g>
        </g>
      </svg>
      {showWordmark && (
        <span className="text-xl font-black tracking-tight">
          <span style={{ color: WORDMARK_PEDI[variant] }}>Pedi</span>
          <span style={{ color: WORDMARK_TRACK[variant] }}>Track</span>
        </span>
      )}
    </span>
  )
}
