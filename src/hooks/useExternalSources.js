import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useExternalSources() {
  return useQuery({
    queryKey: ['external-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_sources')
        .select('*, leagues(id, name, season, year, gender, sport_id, sports(id, name, slug, icon)), phases(id, name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useExternalTeamMappings(sourceId) {
  return useQuery({
    queryKey: ['external-team-mappings', sourceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_team_mappings')
        .select('*, teams(id, name, short_name, logo_url)')
        .eq('source_id', sourceId)
      if (error) throw error
      return data ?? []
    },
    enabled: !!sourceId,
  })
}

export function useUpsertExternalSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('external_sources')
        .upsert(payload, { onConflict: 'provider,event_code,division_code' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['external-sources'] }),
  })
}

export function useSaveExternalTeamMappings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sourceId, mappings }) => {
      const rows = Object.entries(mappings)
        .filter(([, teamId]) => teamId)
        .map(([externalTeamId, teamId]) => ({
          source_id: sourceId,
          external_team_id: externalTeamId,
          team_id: teamId,
          updated_at: new Date().toISOString(),
        }))

      if (rows.length === 0) return []

      const { data, error } = await supabase
        .from('external_team_mappings')
        .upsert(rows, { onConflict: 'source_id,external_team_id' })
        .select()
      if (error) throw error
      return data ?? []
    },
    onSuccess: (_, { sourceId }) => {
      qc.invalidateQueries({ queryKey: ['external-team-mappings', sourceId] })
    },
  })
}

export function useImportCopaFacilMatches() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ source, matches, mappings }) => {
      const importable = matches
        .map((match) => ({
          ...match,
          home_team_id: mappings[match.external_home_team_id],
          away_team_id: mappings[match.external_away_team_id],
        }))
        .filter((match) => match.home_team_id && match.away_team_id)

      let stored = 0
      let skipped = matches.length - importable.length

      if (importable.length > 0) {
        const rows = importable.map((match) => ({
          source_id: source.id,
          external_match_id: match.external_match_id,
          external_home_team_id: match.external_home_team_id,
          external_away_team_id: match.external_away_team_id,
          mapped_home_team_id: match.home_team_id,
          mapped_away_team_id: match.away_team_id,
          round: match.round,
          status: match.status,
          home_score: match.status === 'finished' ? match.home_score : null,
          away_score: match.status === 'finished' ? match.away_score : null,
          scheduled_at: match.scheduled_at,
          date_tbd: match.date_tbd,
          review_status: match.status === 'finished' && match.scheduled_at ? 'confirmed' : 'pending',
          raw: match.raw ?? null,
          updated_at: new Date().toISOString(),
        }))

        const { error } = await supabase
          .from('external_match_archive')
          .upsert(rows, { onConflict: 'source_id,external_match_id' })
        if (error) throw error
        stored = rows.length
      }

      const { error } = await supabase
        .from('external_sources')
        .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', source.id)
      if (error) throw error

      return { created: 0, updated: stored, skipped, total: matches.length }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['matches-home'] })
      qc.invalidateQueries({ queryKey: ['home-matches'] })
      qc.invalidateQueries({ queryKey: ['external-sources'] })
    },
  })
}

export function useExternalMatchArchive(sourceId) {
  return useQuery({
    queryKey: ['external-match-archive', sourceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_match_archive')
        .select('*')
        .eq('source_id', sourceId)
        .order('round', { ascending: true })
        .order('scheduled_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!sourceId,
  })
}

export function useUpdateExternalArchiveMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, sourceId, values }) => {
      const payload = {
        ...values,
        updated_at: new Date().toISOString(),
      }

      if (values.review_status === 'confirmed') {
        payload.confirmed_at = new Date().toISOString()
        const { data: authData } = await supabase.auth.getUser()
        payload.confirmed_by = authData?.user?.id ?? null
      }

      const { error } = await supabase
        .from('external_match_archive')
        .update(payload)
        .eq('id', id)
      if (error) throw error
      return { sourceId }
    },
    onSuccess: (_, { sourceId }) => {
      qc.invalidateQueries({ queryKey: ['external-match-archive', sourceId] })
    },
  })
}

export function useComputeExternalArchiveMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { data, error } = await supabase.rpc('compute_external_match', {
        p_archive_id: id,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_, { sourceId, leagueId }) => {
      qc.invalidateQueries({ queryKey: ['external-match-archive', sourceId] })
      qc.invalidateQueries({ queryKey: ['official-matches-for-league', leagueId] })
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['matches-home'] })
      qc.invalidateQueries({ queryKey: ['home-matches'] })
      qc.invalidateQueries({ queryKey: ['standings'] })
      qc.invalidateQueries({ queryKey: ['standings-admin'] })
    },
  })
}

export function useOfficialMatchesForLeague(leagueId) {
  return useQuery({
    queryKey: ['official-matches-for-league', leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_matches')
        .select('id, league_id, round, scheduled_at, status, home_score, away_score, home_team_id, away_team_id, home_team_name, away_team_name')
        .eq('league_id', leagueId)
        .order('scheduled_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!leagueId,
  })
}
