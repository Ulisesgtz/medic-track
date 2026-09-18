import { describe, it, expect } from 'vitest'
import { sniffImageMimeType } from './imageMime'

function base64Of(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

describe('sniffImageMimeType', () => {
  it('detects JPEG from its magic number', () => {
    expect(sniffImageMimeType(base64Of([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
  })

  it('detects PNG from its magic number', () => {
    expect(sniffImageMimeType(base64Of([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png')
  })

  it('detects GIF from its magic number', () => {
    expect(sniffImageMimeType(base64Of([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe('image/gif')
  })

  it('detects WEBP from its RIFF/WEBP header', () => {
    const bytes = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
    expect(sniffImageMimeType(base64Of(bytes))).toBe('image/webp')
  })

  it('falls back to image/jpeg for an unrecognized header', () => {
    expect(sniffImageMimeType(base64Of([0, 1, 2, 3, 4, 5]))).toBe('image/jpeg')
  })
})
