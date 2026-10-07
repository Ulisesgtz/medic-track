package account

import "time"

// CurrentDisclaimerVersion identifies the text of the "Antes de empezar" notice the frontend shows
// (specs/009 and specs/010). It is the date the text was last changed: changing the wording of the
// notice means bumping this, and every account is then asked to acknowledge the new version.
const CurrentDisclaimerVersion = "2026-10-07"

// DisclaimerAcceptance is the audit record of one account acknowledging one version of the notice.
type DisclaimerAcceptance struct {
	AccountID  string
	Version    string
	AcceptedAt time.Time
}
