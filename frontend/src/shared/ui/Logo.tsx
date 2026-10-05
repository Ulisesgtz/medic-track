import { useId } from 'react'

interface LogoProps {
  /** Rendered square size in px. */
  size?: number
  /**
   * 'dark' = for dark surfaces (bright cyan tile), 'light' = for light
   * surfaces (deep cyan tile). See design-tokens.md, "Logo e iconos".
   */
  variant?: 'dark' | 'light'
  className?: string
}

/**
 * The PediTrack mark: a capsule rotated -45deg and split in half — the light
 * half is the record, the emerald half is the dose the parent confirmed.
 * Used in the app header, the signup screen and the PWA icon (FR-005 of
 * specs/005-identidad-visual-front-end) — never inside screen content.
 */
export function Logo({ size = 32, variant = 'dark', className }: LogoProps) {
  const tile = variant === 'dark' ? '#22d3ee' : '#0e7490'
  // Unique per instance: two logos on one screen must not share a clipPath id.
  const clipId = `pt-logo-${useId().replace(/:/g, '')}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="PediTrack"
      className={className}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="21" y="5" width="22" height="54" rx="11" />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="64" height="64" rx="15" fill={tile} />
      <g transform="rotate(-45 32 32)" clipPath={`url(#${clipId})`}>
        <rect x="21" y="5" width="22" height="54" fill="#ffffff" />
        <rect x="21" y="32" width="22" height="27" fill="#047857" />
        <rect x="21" y="30.6" width="22" height="2.8" fill={tile} />
      </g>
    </svg>
  )
}
