import { useEffect, useState } from 'react'

const LEGACY_TEAMS_KEY = 'vmscore_favorites'
const FAVORITES_KEY = 'vmscore_favorites_v2'

const EMPTY = {
  teams: [],
  leagues: [],
  organizations: [],
}

function uniqueIds(ids = []) {
  return [...new Set(ids.filter(Boolean))]
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

function readFavorites() {
  const stored = readJson(FAVORITES_KEY, null)
  const legacyTeams = readJson(LEGACY_TEAMS_KEY, [])

  if (!stored || Array.isArray(stored)) {
    return {
      ...EMPTY,
      teams: uniqueIds(Array.isArray(stored) ? stored : legacyTeams),
    }
  }

  return {
    teams: uniqueIds(stored.teams?.length ? stored.teams : legacyTeams),
    leagues: uniqueIds(stored.leagues),
    organizations: uniqueIds(stored.organizations),
  }
}

function saveFavorites(next) {
  const normalized = {
    teams: uniqueIds(next.teams),
    leagues: uniqueIds(next.leagues),
    organizations: uniqueIds(next.organizations),
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(normalized))
  localStorage.setItem(LEGACY_TEAMS_KEY, JSON.stringify(normalized.teams))
  window.dispatchEvent(new Event('storage'))
  return normalized
}

function toggleId(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
}

export function useFavorites() {
  const [state, setState] = useState(readFavorites)

  useEffect(() => {
    const sync = () => setState(readFavorites())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function update(next) {
    setState(saveFavorites(next))
  }

  function toggleFavorite(teamId) {
    update({ ...state, teams: toggleId(state.teams, teamId) })
  }

  function toggleLeagueFavorite(leagueId) {
    update({ ...state, leagues: toggleId(state.leagues, leagueId) })
  }

  function toggleOrganizationFavorite(organizationId) {
    update({ ...state, organizations: toggleId(state.organizations, organizationId) })
  }

  return {
    favorites: state.teams,
    favoriteTeamIds: state.teams,
    favoriteLeagueIds: state.leagues,
    favoriteOrganizationIds: state.organizations,
    toggleFavorite,
    toggleLeagueFavorite,
    toggleOrganizationFavorite,
    isFavorite: (teamId) => state.teams.includes(teamId),
    isLeagueFavorite: (leagueId) => state.leagues.includes(leagueId),
    isOrganizationFavorite: (organizationId) => state.organizations.includes(organizationId),
  }
}
