// CRUD de goles "base" (manuales / historicos pre-app).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useManualScorers(phaseId) {
  return useQuery({
    queryKey: ['manual-scorers', phaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manual_scorers')
        .select('*, teams(name, short_name, logo_url, primary_color)')
        .eq('phase_id', phaseId)
        .order('base_goals', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!phaseId,
  })
}

export function useUpsertManualScorer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, phase_id, team_id, player_id, player_name, base_goals }) => {
      const payload = {
        phase_id,
        team_id,
        player_id: player_id || null,
        player_name: (player_name ?? '').trim(),
        base_goals: base_goals === '' || base_goals == null ? 0 : Number(base_goals),
        updated_at: new Date().toISOString(),
      }
      if (id) {
        const { error } = await supabase.from('manual_scorers').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('manual_scorers').upsert(payload, {
          onConflict: 'phase_id,team_id,player_name',
        })
        if (error) throw error
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['manual-scorers', vars.phase_id] })
      qc.invalidateQueries({ queryKey: ['top-scorers'] })
      qc.invalidateQueries({ queryKey: ['scorers-all'] })
    },
  })
}

export function useDeleteManualScorer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('manual_scorers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manual-scorers'] })
      qc.invalidateQueries({ queryKey: ['top-scorers'] })
      qc.invalidateQueries({ queryKey: ['scorers-all'] })
    },
  })
}
