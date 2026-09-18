import { createContext } from 'react'

/** True while the children sidebar is on screen, so AppHeader can drop its own brand row. */
export const SidebarContext = createContext(false)
