import { appUrl, useSite } from '../site.ts'
import { APP_PATHS, NAV_ITEMS } from './nav.ts'

/**
 * El panel del menú del teléfono y la tableta («Menú teléfono» del mock). Está siempre en el HTML con `id="menu"`: sin JavaScript
 * lo muestra `:target` (el botón es un enlace a `#menu`) y con `menu.ts` se abre como diálogo (R2). En la web no existe: ahí el
 * menú completo va en la barra.
 */
export function MobileMenu({ currentPath }: { currentPath: string }) {
  const { settings } = useSite()
  return (
    <nav
      id="menu"
      aria-label="Menú principal"
      className="site-menu -mx-5 mt-3.5 -mb-2.5 flex-col border-t border-line bg-surface px-5 pt-2.5 pb-5 md:-mx-8 md:px-8"
    >
      {NAV_ITEMS.map((item) => (
        <a
          key={item.label}
          href={item.href}
          aria-current={item.path === currentPath ? 'page' : undefined}
          className="flex min-h-[52px] items-center justify-between border-b border-skel text-lg font-bold text-ink no-underline"
        >
          {item.label}
          <span aria-hidden="true" className="text-action">
            ›
          </span>
        </a>
      ))}
      <a
        href={appUrl(settings, APP_PATHS.login)}
        className="mt-3.5 flex min-h-12 items-center justify-center rounded-[14px] border-[1.5px] border-action text-base font-extrabold text-action no-underline"
      >
        Iniciar sesión
      </a>
    </nav>
  )
}
