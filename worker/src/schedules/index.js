// One module per federation/site whose schedule pages are worth scraping.
// Each exports: label (shown in the app's source picker), validId(id) (the
// per-source shape of a league/competition id — never trust it unchecked
// into a URL we're about to fetch), buildUrl(id), and parse(html) ->
// { leagueName, teams, games }. Adding a country is adding a file here and
// one line below — everything else (routing, caching, the app's import UI)
// is source-agnostic.
import * as germany from './germany.js'
import * as france from './france.js'
import * as norway from './norway.js'
import * as denmark from './denmark.js'

export const SOURCES = { germany, france, norway, denmark }
