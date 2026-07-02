package email

import ce "github.com/banzami/banzami/services/common/email"

// Unexported aliases to the shared design-system primitives so the domain
// compositions in template.go read exactly as before the extraction (ADR-033).

type (
	layoutOpts = ce.LayoutOpts
	infoRow    = ce.InfoRow
)

var (
	renderLayout = ce.RenderLayout
	footerSafety = ce.FooterSafety
	esc          = ce.Esc
	textDoc      = ce.TextDoc

	emTitle       = ce.Title
	emPara        = ce.Para
	emButton      = ce.Button
	emDetailRows  = ce.DetailRows
	emNotice      = ce.Notice
	emHeroAmount  = ce.HeroAmount
	emURLFallback = ce.URLFallback

	// AssetsHandler is re-exported so admin-api's server mounts it unchanged.
	AssetsHandler = ce.AssetsHandler
)

const (
	contactEmail = ce.ContactEmail
	siteURL      = ce.SiteURL
)
