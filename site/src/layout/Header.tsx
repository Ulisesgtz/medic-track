import { Logo } from '../ui/Logo.tsx'
import { cn } from '../ui/cn.ts'
import { appUrl, useSite } from '../site.ts'
import { MobileMenu } from './MobileMenu.tsx'
import { APP_PATHS, NAV_ITEMS } from './nav.ts'

function MenuIcons() {
  return (
    <>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="icon-open shrink-0">
        <path d="M4 7h16M4 12h16M4 17h16" className="stroke-ink" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </svg>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="icon-close shrink-0">
        <path d="M6 6l12 12M18 6L6 18" className="stroke-ink" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </svg>
    </>
  )
}

const LOGIN =
  'min-h-11 items-center rounded-xl border-[1.5px] border-hint-border bg-surface px-4 text-[15px] font-extrabold text-action no-underline'

/**
 * El encabezado. Tres diseños con el mismo HTML, cada uno con su corte: teléfono (solo el botón de menú), tableta («Iniciar
 * sesión» y el botón de menú) y web, desde 1200 px (el menú completo con la página actual subrayada). Sin JavaScript el botón
 * es un enlace a `#menu` y el panel se muestra con `:target` (R2).
 */
export function Header({ currentPath }: { currentPath: string }) {
  const { settings } = useSite()
  return (
    <header className="border-b border-line bg-surface px-5 py-2.5 md:px-8 web:px-20 web:py-3.5">
      <div className="flex items-center justify-between gap-3 web:mx-auto web:max-w-[1200px] web:justify-start web:gap-8">
        <Logo href="/" large />
        <nav aria-label="Principal" className="ml-3 hidden flex-1 gap-1.5 web:flex">
          {NAV_ITEMS.map((item) => {
            const current = item.path === currentPath
            return (
              <a
                key={item.label}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center border-b-[3px] px-3.5 text-base no-underline',
                  current ? 'border-action font-extrabold text-ink' : 'border-transparent font-bold text-action',
                )}
              >
                {item.label}
              </a>
            )
          })}
        </nav>
        <div className="flex items-center gap-2.5">
          <a href={appUrl(settings, APP_PATHS.login)} className={cn(LOGIN, 'hidden md:inline-flex')}>
            Iniciar sesión
          </a>
          <a
            id="menu-toggle"
            href="#menu"
            aria-label="Abrir menú"
            aria-controls="menu"
            className="flex size-12 items-center justify-center rounded-[14px] border-[1.5px] border-hint-border bg-surface web:hidden"
          >
            <MenuIcons />
          </a>
        </div>
      </div>
      <MobileMenu currentPath={currentPath} />
    </header>
  )
}
