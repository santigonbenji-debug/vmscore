import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  parseLocosVmMatchId,
  searchLocosVmMatchCandidates,
} from '../lib/locosVm'
import { searchCopaFacilMatchCandidates } from '../lib/copaFacil'

function teamName(match, side) {
  if (side === 'home') return match.home_team_short_name ?? match.home_team_name ?? 'Local'
  return match.away_team_short_name ?? match.away_team_name ?? 'Visitante'
}

function scoreText(match, homeScore, awayScore) {
  return `${teamName(match, 'home')} ${homeScore ?? '-'} - ${awayScore ?? '-'} ${teamName(match, 'away')}`
}

async function notifyTeamLiveEvent({ match, title, body }) {
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: {
      type: 'match_goal',
      matchId: match.id,
      title,
      body,
    },
  })
  if (error || data?.ok !== true) {
    throw new Error(data?.errors?.join('; ') || error?.message || 'No se pudo enviar la notificacion push.')
  }
  if (!data?.sent) {
    throw new Error(data?.recipients
      ? 'El dispositivo favorito no pudo recibir la alerta.'
      : 'No hay dispositivos favoritos suscriptos para recibir la alerta.')
  }
  return data
}

export function useMatchLiveLink(matchId, provider = 'locos_vm') {
  return useQuery({
    queryKey: ['match-live-link', matchId, provider],
    queryFn: async () => {
      let query = supabase
        .from('match_live_links')
        .select('*')
        .eq('match_id', matchId)
      if (provider === 'any') {
        query = query.in('provider', ['copafacil', 'locos_vm']).order('provider', { ascending: true })
      } else {
        query = query.eq('provider', provider)
      }
      const { data, error } = await query
      if (error) throw error
      if (provider === 'any') {
        const statusPriority = {
          in_progress: 0,
          paused: 0,
          finished: 1,
          scheduled: 2,
        }
        return [...(data ?? [])].sort((a, b) => {
          const statusDiff = (statusPriority[a.last_status] ?? 3) - (statusPriority[b.last_status] ?? 3)
          if (statusDiff !== 0) return statusDiff
          const aTime = new Date(a.last_synced_at ?? a.updated_at ?? 0).getTime()
          const bTime = new Date(b.last_synced_at ?? b.updated_at ?? 0).getTime()
          if (aTime !== bTime) return bTime - aTime
          if (a.provider === 'copafacil' && b.provider !== 'copafacil') return -1
          if (b.provider === 'copafacil' && a.provider !== 'copafacil') return 1
          return 0
        })[0] ?? null
      }
      return data?.[0] ?? null
    },
    enabled: !!matchId,
  })
}

export function useUpdateLocosClock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ match, link, action, minute }) => {
      if (!match || !link) throw new Error('Falta vincular el partido con Locos VM.')
      const now = new Date().toISOString()
      const parsedMinute = minute === '' || minute === null || minute === undefined
        ? null
        : Number(minute)

      const patch = {
        enabled: true,
        last_synced_at: now,
        updated_at: now,
      }

      if (action === 'start') {
        patch.last_status = 'in_progress'
        patch.last_minute = parsedMinute ?? 0
        patch.last_second = 0
        patch.live_started_at = now
        patch.halftime_at = null
        patch.second_half_started_at = null
      }

      if (action === 'halftime') {
        patch.last_status = 'paused'
        patch.last_minute = parsedMinute ?? 45
        patch.last_second = 0
        patch.halftime_at = now
      }

      if (action === 'second_half') {
        patch.last_status = 'in_progress'
        patch.last_minute = parsedMinute ?? 45
        patch.last_second = 0
        patch.second_half_started_at = now
      }

      if (action === 'stop') {
        patch.last_status = 'in_progress'
        patch.last_minute = parsedMinute ?? link.last_minute ?? null
        patch.last_second = 0
        patch.live_started_at = null
        patch.second_half_started_at = null
      }

      if (action === 'set_minute') {
        patch.last_status = link.last_status ?? 'in_progress'
        patch.last_minute = parsedMinute
        patch.last_second = 0
        patch.live_started_at = null
        patch.second_half_started_at = null
      }

      const { data, error } = await supabase
        .from('match_live_links')
        .update(patch)
        .eq('id', link.id)
        .eq('provider', 'locos_vm')
        .select()
        .single()
      if (error) throw error
      return { link: data, matchId: match.id }
    },
    onSuccess: ({ matchId }) => {
      qc.invalidateQueries({ queryKey: ['match-live-link', matchId] })
      qc.invalidateQueries({ queryKey: ['match-live-link', matchId, 'locos_vm'] })
      qc.invalidateQueries({ queryKey: ['match-live-link', matchId, 'any'] })
      qc.invalidateQueries({ queryKey: ['match', matchId] })
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['matches-home'] })
      qc.invalidateQueries({ queryKey: ['home-matches'] })
    },
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

export function useSearchCopaFacilMatches() {
  return useMutation({
    mutationFn: async ({ match }) => {
      if (!match) throw new Error('Falta el partido de VMScore.')

      const { data: sources, error: sourcesError } = await supabase
        .from('external_sources')
        .select('*, leagues(id, name), phases(id, name)')
        .eq('provider', 'copafacil')
        .eq('sync_enabled', true)
      if (sourcesError) throw sourcesError

      const sourceIds = (sources ?? []).map((source) => source.id)
      let mappings = []
      if (sourceIds.length > 0) {
        const { data, error } = await supabase
          .from('external_team_mappings')
          .select('source_id, external_team_id, team_id')
          .in('source_id', sourceIds)
        if (error) throw error
        mappings = data ?? []
      }

      const mappingsBySource = mappings.reduce((acc, mapping) => {
        acc[mapping.source_id] = acc[mapping.source_id] ?? {}
        acc[mapping.source_id][mapping.external_team_id] = mapping.team_id
        return acc
      }, {})

      return searchCopaFacilMatchCandidates({ match, sources: sources ?? [], mappingsBySource })
    },
  })
}

export function useSaveCopaFacilMatchLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ match, candidate }) => {
      if (!match || !candidate) throw new Error('Falta seleccionar una coincidencia de Copa Facil.')

      const now = new Date().toISOString()
      const { error: matchError } = await supabase
        .from('matches')
        .update({
          external_provider: 'copafacil',
          external_source_id: candidate.source_id,
          external_match_id: candidate.external_match_id,
          updated_at: now,
        })
        .eq('id', match.id)
      if (matchError) throw matchError

      const { data: link, error: linkError } = await supabase
        .from('match_live_links')
        .upsert({
          match_id: match.id,
          provider: 'copafacil',
          external_match_id: candidate.external_match_id,
          external_url: candidate.source_url || null,
          enabled: true,
          updated_at: now,
        }, { onConflict: 'match_id,provider' })
        .select()
        .single()
      if (linkError) throw linkError

      return { link, matchId: match.id }
    },
    onSuccess: (_, { match }) => {
      qc.invalidateQueries({ queryKey: ['match', match.id] })
      qc.invalidateQueries({ queryKey: ['match-live-link', match.id, 'copafacil'] })
      qc.invalidateQueries({ queryKey: ['match-live-link', match.id, 'any'] })
    },
  })
}

export function useSyncLocosVmLive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ match, link }) => {
      if (!match || !link) throw new Error('Falta vincular el partido.')
      const { data, error } = await supabase.functions.invoke('sync-locos-live', {
        body: { matchIds: [match.id], limit: 1 },
      })
      if (error) throw error
      const result = data?.results?.[0]
      if (result?.error) throw new Error(result.error)
      return result ?? data
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

export function useCreateManualLiveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ match, teamId, minute = null }) => {
      if (!match || !teamId) throw new Error('Selecciona el equipo que marco el gol.')

      const isHome = teamId === match.home_team_id
      const title = `Gol de ${teamName(match, isHome ? 'home' : 'away')}`
      const { data, error } = await supabase.rpc('record_manual_live_goal', {
        p_match_id: match.id,
        p_team_id: teamId,
        p_minute: minute === '' || minute === null || minute === undefined ? null : Number(minute),
      })
      if (error) throw error

      let pushWarning = ''
      const eventId = data?.event?.id
      try {
        await notifyTeamLiveEvent({
          match,
          title,
          body: scoreText(match, data.home_score, data.away_score),
        })
        if (eventId) {
          await supabase.rpc('record_manual_push_delivery', {
            p_event_id: eventId,
            p_error: null,
          })
        }
      } catch (pushError) {
        pushWarning = pushError?.message || 'El aviso no pudo enviarse y queda pendiente de reintento.'
        if (eventId) {
          await supabase.rpc('record_manual_push_delivery', {
            p_event_id: eventId,
            p_error: pushWarning,
          })
        }
      }

      return { ...data, pushWarning }
    },
    onSuccess: (_, { match }) => {
      qc.invalidateQueries({ queryKey: ['live-sync-events', match.id] })
      qc.invalidateQueries({ queryKey: ['match', match.id] })
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['matches-home'] })
      qc.invalidateQueries({ queryKey: ['home-matches'] })
    },
  })
}

export function useSyncCopaFacilLive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matchId }) => {
      const { data, error } = await supabase.functions.invoke('sync-copafacil-live', {
        body: { matchIds: [matchId], limit: 1 },
      })
      if (error) throw error
      return data
    },
    onSuccess: (_, { matchId }) => {
      qc.invalidateQueries({ queryKey: ['match-live-link', matchId, 'copafacil'] })
      qc.invalidateQueries({ queryKey: ['match-live-link', matchId, 'any'] })
      qc.invalidateQueries({ queryKey: ['live-sync-events', matchId] })
      qc.invalidateQueries({ queryKey: ['match', matchId] })
    },
  })
}
