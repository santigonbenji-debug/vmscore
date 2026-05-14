import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  buildLiveStatePayload,
  fetchLocosVmLiveState,
  parseLocosVmMatchId,
  searchLocosVmMatchCandidates,
} from '../lib/locosVm'

function teamName(match, side) {
  if (side === 'home') return match.home_team_short_name ?? match.home_team_name ?? 'Local'
  return match.away_team_short_name ?? match.away_team_name ?? 'Visitante'
}

function buildGoalEvents({ match, link, previousHome, previousAway, nextHome, nextAway, minute, raw }) {
  const events = []
  const homeDiff = Math.max(0, Number(nextHome ?? 0) - Number(previousHome ?? 0))
  const awayDiff = Math.max(0, Number(nextAway ?? 0) - Number(previousAway ?? 0))

  for (let index = 1; index <= homeDiff; index += 1) {
    const score = Number(previousHome ?? 0) + index
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'locos_vm',
      external_match_id: link.external_match_id,
      event_key: `goal-home-${score}-${nextAway ?? 0}`,
      event_type: 'goal',
      team_id: match.home_team_id,
      team_side: 'home',
      minute,
      home_score: score,
      away_score: nextAway,
      title: `Gol de ${teamName(match, 'home')}`,
      raw,
    })
  }

  for (let index = 1; index <= awayDiff; index += 1) {
    const score = Number(previousAway ?? 0) + index
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'locos_vm',
      external_match_id: link.external_match_id,
      event_key: `goal-away-${nextHome ?? 0}-${score}`,
      event_type: 'goal',
      team_id: match.away_team_id,
      team_side: 'away',
      minute,
      home_score: nextHome,
      away_score: score,
      title: `Gol de ${teamName(match, 'away')}`,
      raw,
    })
  }

  return events
}

function scoreText(match, homeScore, awayScore) {
  return `${teamName(match, 'home')} ${homeScore ?? '-'} - ${awayScore ?? '-'} ${teamName(match, 'away')}`
}

async function notifyLiveSync({ match, type, title, body }) {
  try {
    await supabase.functions.invoke('send-push', {
      body: { type, matchId: match.id, title, body },
    })
  } catch (error) {
    console.warn('No se pudo enviar notificacion de vivo', error)
  }
}

export function useMatchLiveLink(matchId) {
  return useQuery({
    queryKey: ['match-live-link', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_live_links')
        .select('*')
        .eq('match_id', matchId)
        .eq('provider', 'locos_vm')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!matchId,
  })
}

export function useLiveSyncEvents(matchId) {
  return useQuery({
    queryKey: ['live-sync-events', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_sync_events')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!matchId,
  })
}

export function useSaveMatchLiveLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matchId, externalMatchId, externalUrl }) => {
      const parsedExternalId = parseLocosVmMatchId(externalMatchId || externalUrl)
      if (!parsedExternalId) throw new Error('Ingresa el ID o link del partido de Locos VM.')

      const { data, error } = await supabase
        .from('match_live_links')
        .upsert({
          match_id: matchId,
          provider: 'locos_vm',
          external_match_id: parsedExternalId,
          external_url: externalUrl || null,
          enabled: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'match_id,provider' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, { matchId }) => {
      qc.invalidateQueries({ queryKey: ['match-live-link', matchId] })
    },
  })
}

export function useSearchLocosVmMatches() {
  return useMutation({
    mutationFn: async ({ match }) => {
      if (!match) throw new Error('Falta el partido de VMScore.')
      return searchLocosVmMatchCandidates(match)
    },
  })
}

export function useSyncLocosVmLive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ match, link }) => {
      if (!match || !link) throw new Error('Falta vincular el partido.')

      const rawState = await fetchLocosVmLiveState(link.external_match_id)
      const state = buildLiveStatePayload(rawState)
      if (!state) throw new Error('No se pudo leer el estado en vivo.')

      const previousHome = link.last_home_score
      const previousAway = link.last_away_score
      const nextHome = state.home_score
      const nextAway = state.away_score
      const now = new Date().toISOString()

      const startedNow = !link.last_start_notified_at && state.status === 'in_progress'
      const finishedNow = !link.last_finish_notified_at && state.status === 'finished'
      const goalEvents = previousHome != null && previousAway != null && nextHome != null && nextAway != null
        ? buildGoalEvents({
            match,
            link,
            previousHome,
            previousAway,
            nextHome,
            nextAway,
            minute: state.minute,
            raw: rawState,
          })
        : []

      const liveEvents = []
      if (startedNow) {
        liveEvents.push({
          match_id: match.id,
          link_id: link.id,
          provider: 'locos_vm',
          external_match_id: link.external_match_id,
          event_key: 'match-started',
          event_type: 'start',
          minute: state.minute ?? 0,
          home_score: nextHome,
          away_score: nextAway,
          title: 'Inicio del partido',
          raw: rawState,
        })
      }
      liveEvents.push(...goalEvents)
      if (finishedNow) {
        liveEvents.push({
          match_id: match.id,
          link_id: link.id,
          provider: 'locos_vm',
          external_match_id: link.external_match_id,
          event_key: `match-finished-${nextHome ?? '-'}-${nextAway ?? '-'}`,
          event_type: 'finish',
          minute: state.minute,
          home_score: nextHome,
          away_score: nextAway,
          title: `Finalizo: ${teamName(match, 'home')} ${nextHome ?? '-'} - ${nextAway ?? '-'} ${teamName(match, 'away')}`,
          raw: rawState,
        })
      }

      if (liveEvents.length > 0) {
        const { error: eventError } = await supabase
          .from('live_sync_events')
          .upsert(liveEvents, { onConflict: 'match_id,provider,event_key', ignoreDuplicates: true })
        if (eventError) throw eventError
      }

      const { data: updatedLink, error: linkError } = await supabase
        .from('match_live_links')
        .update({
          last_external_state: rawState,
          last_status: state.status,
          last_period: state.period,
          last_minute: state.minute,
          last_second: state.second,
          last_home_score: nextHome,
          last_away_score: nextAway,
          last_synced_at: now,
          last_start_notified_at: startedNow ? now : link.last_start_notified_at,
          last_finish_notified_at: finishedNow ? now : link.last_finish_notified_at,
          updated_at: now,
        })
        .eq('id', link.id)
        .select()
        .single()
      if (linkError) throw linkError

      if (startedNow) {
        notifyLiveSync({
          match,
          type: 'match_started',
          title: 'Inicio del partido',
          body: `${teamName(match, 'home')} vs ${teamName(match, 'away')}`,
        })
      }
      for (const goalEvent of goalEvents) {
        notifyLiveSync({
          match,
          type: 'match_goal',
          title: goalEvent.title,
          body: scoreText(match, goalEvent.home_score, goalEvent.away_score),
        })
      }
      if (finishedNow) {
        notifyLiveSync({
          match,
          type: 'match_finished_live',
          title: 'Finalizo el partido',
          body: scoreText(match, nextHome, nextAway),
        })
      }

      return { state, rawState, link: updatedLink, events: liveEvents }
    },
    onSuccess: (_, { match }) => {
      qc.invalidateQueries({ queryKey: ['match-live-link', match.id] })
      qc.invalidateQueries({ queryKey: ['live-sync-events', match.id] })
      qc.invalidateQueries({ queryKey: ['match', match.id] })
    },
  })
}

export function useUpdateLiveSyncEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, matchId, status }) => {
      const { error } = await supabase
        .from('live_sync_events')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return { matchId }
    },
    onSuccess: ({ matchId }) => {
      qc.invalidateQueries({ queryKey: ['live-sync-events', matchId] })
    },
  })
}
