// specs/072, research R5: what the phone sends about an error is cleaned here and again by the server (backend/internal/clienterror),
// with the SAME rules and the same table of cases (specs/072-monitoreo-errores-frontend/contracts/clean-cases.json). An error message can
// carry a name, an e-mail, an address or a number a person typed; none of it must travel.

export const MAX_MESSAGE_RUNES = 200

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const TOKEN_RUN = /[A-Za-z0-9_-]{32,}/g
const URL_TEXT = /https?:\/\/\S+/g
// A quoted piece (no back-references: the server's regexp engine has none either): ASCII quotes and backticks plus the typographic
// pairs ‘…’ “…” «…» ‹…›. Short identifiers are kept: «reading 'doses'».
const QUOTED = /'[^']*'|"[^"]*"|`[^`]*`|‘[^’]*’|“[^”]*”|«[^»]*»|‹[^›]*›/g
const IDENTIFIER = /^[A-Za-z_$][\w$.]{0,40}$/
const LONG_NUMBER = /\d{4,}/g

/** Makes an error message safe to send: nothing that identifies a person, an address or a record leaves the phone. */
export function cleanMessage(input: string): string {
  let text = input
    .replace(/\p{Cc}/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .join(' ')
  text = text.replace(EMAIL, '[correo]').replace(UUID, '[id]')
  // A real token always has digits among its letters; a long run of letters only is a word.
  text = text.replace(TOKEN_RUN, (run) => (/\d/.test(run) ? '[token]' : run))
  text = text.replace(URL_TEXT, '[url]')
  // Every opening and closing mark is one UTF-16 unit, so slicing both ends off is safe.
  text = text.replace(QUOTED, (whole) => (IDENTIFIER.test(whole.slice(1, -1)) ? whole : '[texto]'))
  text = text.replace(LONG_NUMBER, '[n]')

  const runes = Array.from(text)
  if (runes.length > MAX_MESSAGE_RUNES) return runes.slice(0, MAX_MESSAGE_RUNES - 1).join('') + '…'
  return text
}
