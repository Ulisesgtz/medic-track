import { useEffect } from 'react'

let unsaved = 0

/** A form with something typed or a photo chosen says so; the returned function says it is done. */
export function markUnsaved(): () => void {
  unsaved += 1
  let released = false
  return () => {
    if (released) return
    released = true
    unsaved -= 1
  }
}

/** True while some form holds work that a page reload would lose (specs/017: "Actualizar" asks first). */
export function hasUnsavedWork() {
  return unsaved > 0
}

/** Registers the form's work as unsaved while `dirty` is true and until it unmounts. */
export function useUnsavedWork(dirty: boolean) {
  useEffect(() => (dirty ? markUnsaved() : undefined), [dirty])
}
