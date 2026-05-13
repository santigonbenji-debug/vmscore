// Al principio de useMatches.js agregar:
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { startOfDay, endOfDay } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

const TZ = 'America/Argentina/San_Luis'

// Convierte el string de datetime-local (hora local San Luis) a UTC para guardar
function localToUTC(localStr) {
  return fromZonedTime(new Date(localStr), TZ).toISOString()
}

// --- QUERIES ---

export function useMatches({ phaseId, groupId, status, round } = {}) {
  return useQuery({
    queryKey: ['matches', phaseId, groupId, status, round],
    queryFn: async () => {
      let q = supabase.from('v_matches').select('*').order('scheduled_at', { ascending: true })
      if (phaseId) q = q.eq('phase_id', phaseId)
      if (groupId) q = q.eq('group_id', groupId)
      if (status)  q = q.eq('status', status)
      if (round)   q = q.eq('round', round)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    enabled: !!phaseId,
  })
}

export function useMatchesHome({ sportSlug, limit = 10 } = {}) {
  return useQuery({
    queryKey: ['matches-home', sportSlug, limit],
    queryFn: async () => {
      let q = supabase.from('v_matches').select('*').order('scheduled_at', { ascending: false }).limit(limit)
      if (sportSlug) q = q.eq('sport_slug', sportSlug)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}

export function useTeamMatches(teamId, limit = 50) {
  return useQuery({
    queryKey: ['team-matches', teamId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_matches')
        .select('*')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order('scheduled_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
    enabled: !!teamId,
  })
}

function pairKey(match) {
  return [match.home_team_id, match.away_team_id].filter(Boolean).sort().join('|')
}

function matchDuplicateKey(match) {
  const teams = pairKey(match)
  if (!teams) return null
  if (match.scheduled_at) {
    return `${match.league_id ?? 'sin-liga'}|${teams}|${new Date(match.scheduled_at).toISOString().slice(0, 10)}`
  }
  if (match.round) {
    return `${match.league_id ?? 'sin-liga'}|${teams}|round-${match.round}`
  }
  return null
}

function removeDuplicateTeamMatches(matches) {
  const byKey = new Map()

  for (const match of matches) {
    const key = matchDuplicateKey(match)
    if (!key) {
      byKey.set(match.app_id, match)
      continue
    }

    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, match)
      continue
    }

    const currentPreferred = current.source_kind === 'external' && current.preferred_display
    const nextPreferred = match.source_kind === 'external' && match.preferred_display
    const currentOfficial = current.source_kind === 'official'
    const nextOfficial = match.source_kind === 'official'

    if (!currentPreferred && nextPreferred) {
      byKey.set(key, match)
    } else if (!currentPreferred && !nextPreferred && !currentOfficial && nextOfficial) {
      byKey.set(key, match)
    }
  }

  return [...byKey.values()]
}

export function useTeamMatchesWithExternal(teamId, limit = 80) {
  return useQuery({
    queryKey: ['team-matches-with-external', teamId, limit],
    queryFn: async () => {
      const [{ data: official, error: officialError }, { data: external, error: externalError }] = await Promise.all([
        supabase
          .from('v_matches')
          .select('*')
          .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
          .order('scheduled_at', { ascending: false, nullsFirst: false })
          .limit(limit),
        supabase
          .from('v_external_matches_public')
          .select('*')
          .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
          .order('scheduled_at', { ascending: false, nullsFirst: false })
          .limit(limit),
      ])
      if (officialError) throw officialError
      if (externalError) throw externalError

      const officialRows = (official ?? []).map((match) => ({
        ...match,
        app_id: `official-${match.id}`,
        source_kind: 'official',
        clickable: true,
      }))

      const externalRows = (external ?? []).map((match) => ({
        ...match,
        id: `external-${match.archive_id}`,
        app_id: `external-${match.archive_id}`,
        source_kind: 'external',
        clickable: false,
      }))

      return removeDuplicateTeamMatches([...officialRows, ...externalRows])
        .sort((a, b) => {
          if (!a.scheduled_at && !b.scheduled_at) return Number(b.round ?? 0) - Number(a.round ?? 0)
          if (!a.scheduled_at) return 1
          if (!b.scheduled_at) return -1
          return new Date(b.scheduled_at) - new Date(a.scheduled_at)
        })
        .slice(0, limit)
    },
    enabled: !!teamId,
  })
}

export function useMatch(matchId) {
  return useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const [{ data: match, error }, { data: events }] = await Promise.all([
        supabase.from('v_matches').select('*').eq('id', matchId).single(),
        supabase.from('match_events').select('*').eq('match_id', matchId).order('minute'),
      ])
      if (error) throw error
      return { match, events: events ?? [] }
    },
    enabled: !!matchId,
  })
}
// Buscar partido duplicado: misma fase, mismos equipos (sin importar local/visitante), mismo horario
// Devuelve el partido duplicado si existe, o null si no hay conflicto
async function buscarDuplicado({ phase_id, home_team_id, away_team_id, scheduled_at, excludeId }) {
  // Traer todos los partidos de esa fase y horario exacto
  let query = supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, status')
    .eq('phase_id', phase_id)
    .eq('scheduled_at', scheduled_at)
  // Si estamos editando, excluir el propio partido de la búsqueda
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  if (error) throw error
  // Normalizar el par de equipos para comparar sin importar orden
  const claveBuscada = [home_team_id, away_team_id].sort().join('|')
  return (data ?? []).find((m) =>
    [m.home_team_id, m.away_team_id].sort().join('|') === claveBuscada
  ) ?? null
}
// --- MUTATIONS ---

// Crear partido + auto-inscribir equipos en team_phases + validar duplicados
export function useCreateMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ scheduledAtLocal, home_team_id, away_team_id, phase_id, group_id, ...rest }) => {
      const scheduled_at = localToUTC(scheduledAtLocal)
      // Validar que no exista un duplicado antes de crear
      const duplicado = await buscarDuplicado({ phase_id, home_team_id, away_team_id, scheduled_at })
      if (duplicado) {
        // Lanzar error con código identificable + el id del partido existente
        const err = new Error('Ya existe un partido entre estos dos equipos en este horario.')
        err.code = 'DUPLICATE_MATCH'
        err.existingMatchId = duplicado.id
        throw err
      }
      // Inscribir equipos en la fase automáticamente
      await supabase.from('team_phases').upsert(
        [
          { team_id: home_team_id, phase_id, group_id: group_id || null },
          { team_id: away_team_id, phase_id, group_id: group_id || null },
        ],
        { onConflict: 'team_id,phase_id', ignoreDuplicates: true }
      )
      const { data: match, error } = await supabase
        .from('matches')
        .insert({ home_team_id, away_team_id, phase_id, group_id: group_id || null, scheduled_at, ...rest })
        .select().single()
      if (error) throw error
      return match
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['matches-home'] })
    },
  })
}

// Actualizar partido + validar duplicados (excluyendo el propio id)
export function useUpdateMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, scheduledAtLocal, ...data }) => {
      if (scheduledAtLocal) data.scheduled_at = localToUTC(scheduledAtLocal)
      // Si cambiaron equipos o fecha, validar que no genere duplicado con otro partido
      if (data.scheduled_at && data.home_team_id && data.away_team_id && data.phase_id) {
        const duplicado = await buscarDuplicado({
          phase_id: data.phase_id,
          home_team_id: data.home_team_id,
          away_team_id: data.away_team_id,
          scheduled_at: data.scheduled_at,
          excludeId: id,
        })
        if (duplicado) {
          const err = new Error('Ya existe un partido entre estos dos equipos en este horario.')
          err.code = 'DUPLICATE_MATCH'
          err.existingMatchId = duplicado.id
          throw err
        }
      }
      const { error } = await supabase
        .from('matches')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['match'] })
    },
  })
}

export function useUpdateMatchDetails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, scheduledAtLocal, ...data }) => {
      const payload = { ...data }
      if (scheduledAtLocal) {
        payload.scheduled_at = localToUTC(scheduledAtLocal)
        payload.date_tbd = false
      } else {
        payload.scheduled_at = null
        payload.date_tbd = true
      }

      const { error } = await supabase
        .from('matches')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['match'] })
      qc.invalidateQueries({ queryKey: ['matches-home'] })
      qc.invalidateQueries({ queryKey: ['home-matches'] })
      qc.invalidateQueries({ queryKey: ['matches-all-with-external'] })
    },
  })
}

export function useDeleteMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('matches').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  })
}

// Guardar resultado completo: scores + eventos → trigger recalcula standings
export function useSaveResult() {
  const qc = useQueryClient()
  return useMutation({
   mutationFn: async ({ matchId, homeScore, awayScore, events = [], mvpPlayerName = null, mvpTeamId = null, mvpPlayerId = null }) => {
  // 1. Actualizar partido con scores + MVP
  const parsedHomeScore = homeScore === null || homeScore === undefined || homeScore === '' ? null : parseInt(homeScore)
  const parsedAwayScore = awayScore === null || awayScore === undefined || awayScore === '' ? null : parseInt(awayScore)
  const hasCompleteResult = Number.isFinite(parsedHomeScore) && Number.isFinite(parsedAwayScore)
  const matchUpdate = {
    mvp_player_name: mvpPlayerName || null,
    mvp_team_id:     mvpTeamId || null,
    mvp_player_id:   mvpPlayerId || null,
    updated_at:      new Date().toISOString(),
  }

  if (hasCompleteResult) {
    matchUpdate.home_score = parsedHomeScore
    matchUpdate.away_score = parsedAwayScore
    matchUpdate.status = 'finished'
  }

  const { error: matchError } = await supabase.from('matches').update(matchUpdate).eq('id', matchId)
  if (matchError) throw matchError

  // 2. Reemplazar eventos
  await supabase.from('match_events').delete().eq('match_id', matchId)
  if (events.length > 0) {
    const { error: evErr } = await supabase
      .from('match_events')
      .insert(events.map((e) => ({
        match_id: matchId,
        team_id: e.team_id,
        player_id: e.player_id || null,
        player_name: e.player_name || null,
        event_type: e.event_type,
        minute: e.minute ?? null,
        notes: e.notes ?? null,
      })))
    if (evErr) throw evErr
  }

  supabase.functions.invoke('send-push', {
    body: { type: 'match_finished', matchId },
  }).catch((error) => {
    console.warn('No se pudo enviar notificacion push', error)
  })
},
    onSuccess: (_, { matchId }) => {
      qc.invalidateQueries({ queryKey: ['match', matchId] })
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['standings'] })
    },
  })
}

export function useUpdateMatchStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase
        .from('matches')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  })
}
// Partidos filtrados por fecha específica (para el calendario tipo SofaScore)
export function useMatchesByDate(fecha) {
  return useQuery({
    queryKey: ['matches-by-date', fecha],
    queryFn: async () => {
      // Calcular inicio y fin del día en zona horaria de San Luis
      const TZ = 'America/Argentina/San_Luis'

      const diaLocal   = toZonedTime(fecha, TZ)
      const inicioDia  = fromZonedTime(startOfDay(diaLocal), TZ)
      const finDia     = fromZonedTime(endOfDay(diaLocal), TZ)

      const { data, error } = await supabase
        .from('v_matches')
        .select('*')
        .gte('scheduled_at', inicioDia.toISOString())
        .lte('scheduled_at', finDia.toISOString())
        .order('scheduled_at', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    enabled: !!fecha,
  })
}
// Suscripción en tiempo real a un partido
// Cuando el admin carga datos en vivo, todos los viewers lo ven al instante
export function useMatchRealtime(matchId, onUpdate) {
  useEffect(() => {
    if (!matchId) return

    const canal = supabase
      .channel(`match-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          onUpdate(payload)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [matchId, onUpdate])
}
