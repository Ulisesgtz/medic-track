import type { ReactNode } from 'react'
import { Footer } from './Footer.tsx'
import { Header } from './Header.tsx'

/**
 * El esqueleto de toda página: enlace para saltar al contenido, encabezado, el contenido y el pie. Los tres diseños (teléfono,
 * tableta y web) salen de las clases de cada pieza, con un corte por diseño: teléfono por debajo de 768 px, tableta de 768 a
 * 1199 y web desde 1200 (`web:`). Las páginas interiores usan el diseño de teléfono por debajo de 1200 (ver desviaciones.md).
 */
export function Layout({ currentPath, children }: { currentPath: string; children: ReactNode }) {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-3 focus:font-extrabold"
      >
        Saltar al contenido
      </a>
      <Header currentPath={currentPath} />
      <main id="contenido">{children}</main>
      <Footer />
    </>
  )
}
