// Goleadores: lee de v_top_scorers que ya mergea goles automaticos (match_events) + base manual (manual_scorers)
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useTopScorers(leagueId, limit = 10) {
  return useQuery({
    queryKey: ['top-scorers', leagueId, limit],
    queryFn: async () => {
      if (!leagueId) return []
      const { data, error } = await supabase
        .from('v_top_scorers')
        .select('*')
        .eq('league_id', leagueId)
        .order('goals', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).filter((s) => Number(s.goals) > 0)
    },
    enabled: !!leagueId,
  })
}
