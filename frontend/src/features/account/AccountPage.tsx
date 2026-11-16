import { Link } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { ACCOUNT } from './accountText'
import { downloadMyData } from './api'
import { DownloadCard, cardClass } from './DownloadCard'

/**
 * `/cuenta` (specs/070, contracts/ui.md): the session's e-mail, plan and family, «Descargar todos mis datos» (any plan) and the
 * way to «Eliminar mi cuenta». No solid button here: deleting is reached on purpose, on its own page.
 */
export function AccountPage() {
  const { isDesktop } = useSidebarSession()
  const variant = isDesktop ? 'desktop' : 'phone'
  const account = useCurrentAccount().data
  const subtitle = account
    ? [
        account.email,
        account.plan === 'paid' ? ACCOUNT.planFull : ACCOUNT.planFree,
        account.family ? ACCOUNT.familyOf(account.family.ownerName) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={undefined}
      backLabel={ACCOUNT.back}
      backTo="/home"
      title={ACCOUNT.title}
      subtitle={subtitle}
      maxWidth="max-w-[720px]"
    >
      {account && (
        <DownloadCard variant={variant} fetchFile={(token) => downloadMyData(account.id, token)} />
      )}
      <section className={cardClass} aria-labelledby="delete-title">
        <h2 id="delete-title" className="text-[17px] font-black text-ink">
          {ACCOUNT.deleteTitle}
        </h2>
        <p className="text-[15px] leading-relaxed text-body">{ACCOUNT.deleteBody}</p>
        <div>
          <Link to="/cuenta/eliminar" className={pageHeaderButton('secondary', variant)}>
            {ACCOUNT.deleteLink}
          </Link>
        </div>
      </section>
    </RoutinePageFrame>
  )
}
