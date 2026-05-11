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

async function findDuplicateMatch({ phaseId, homeTeamId, awayTeamId, scheduledAt }) {
  const { data, error } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id')
    .eq('phase_id', phaseId)
    .eq('scheduled_at', scheduledAt)

  if (error) throw error

  const wanted = [homeTeamId, awayTeamId].sort().join('|')
  return (data ?? []).find((match) =>
    [match.home_team_id, match.away_team_id].sort().join('|') === wanted
  ) ?? null
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

      let created = 0
      let updated = 0
      let skipped = matches.length - importable.length

      for (const match of importable) {
        const scores = match.status === 'finished'
          ? { home_score: match.home_score, away_score: match.away_score }
          : { home_score: null, away_score: null }

        const basePayload = {
          phase_id: source.phase_id,
          home_team_id: match.home_team_id,
          away_team_id: match.away_team_id,
          scheduled_at: match.scheduled_at,
          round: match.round,
          status: match.status,
          external_provider: 'copafacil',
          external_source_id: source.id,
          external_match_id: match.external_match_id,
          updated_at: new Date().toISOString(),
          ...scores,
        }

        const { data: existingByExternal, error: externalError } = await supabase
          .from('matches')
          .select('id')
          .eq('external_provider', 'copafacil')
          .eq('external_match_id', match.external_match_id)
          .maybeSingle()
        if (externalError) throw externalError

        const duplicate = existingByExternal
          ? null
          : await findDuplicateMatch({
            phaseId: source.phase_id,
            homeTeamId: match.home_team_id,
            awayTeamId: match.away_team_id,
            scheduledAt: match.scheduled_at,
          })

        if (existingByExternal || duplicate) {
          const targetId = existingByExternal?.id ?? duplicate.id
          const { error } = await supabase
            .from('matches')
            .update(basePayload)
            .eq('id', targetId)
          if (error) throw error
          updated += 1
        } else {
          await supabase.from('team_phases').upsert([
            { team_id: match.home_team_id, phase_id: source.phase_id },
            { team_id: match.away_team_id, phase_id: source.phase_id },
          ], { onConflict: 'team_id,phase_id', ignoreDuplicates: true })

          const { error } = await supabase
            .from('matches')
            .insert(basePayload)
          if (error) throw error
          created += 1
        }
      }

      const { error } = await supabase
        .from('external_sources')
        .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', source.id)
      if (error) throw error

      return { created, updated, skipped, total: matches.length }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['matches-home'] })
      qc.invalidateQueries({ queryKey: ['external-sources'] })
    },
  })
}
