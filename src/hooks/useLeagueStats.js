import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useGoleadoresByPhases(ligaId, phaseIds, limit = 5) {
  return useQuery({
    queryKey: ['goleadores', ligaId, phaseIds, limit],
    queryFn: async () => {
      if (!phaseIds.length) return []

      const { data, error } = await supabase
        .from('match_events')
        .select(`
          player_name, team_id,
          teams(name, short_name, primary_color, logo_url),
          matches!inner(phase_id)
        `)
        .in('event_type', ['goal', 'penalty_goal'])
        .in('matches.phase_id', phaseIds)
      if (error) throw error

      const conteo = (data ?? []).reduce((acc, e) => {
        if (!e.player_name) return acc
        const key = `${e.player_name}__${e.team_id}`
        if (!acc[key]) acc[key] = { player_name: e.player_name, team: e.teams, goles: 0 }
        acc[key].goles++
        return acc
      }, {})

      return Object.values(conteo).sort((a, b) => b.goles - a.goles).slice(0, limit)
    },
    enabled: phaseIds.length > 0,
  })
}
