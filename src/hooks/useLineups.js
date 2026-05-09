import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useMatchLineups(matchId) {
  return useQuery({
    queryKey: ['match-lineups', matchId],
    queryFn: async () => {
      if (!matchId) return []
      const { data, error } = await supabase
        .from('v_match_lineups')
        .select('*')
        .eq('match_id', matchId)
        .order('team_id')
        .order('role')
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
    enabled: !!matchId,
  })
}

export function useAddMatchLineupPlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matchId, teamId, playerId, manualPlayerName, role, shirtNumber, position, sortOrder }) => {
      const { data, error } = await supabase
        .from('match_lineups')
        .insert({
          match_id: matchId,
          team_id: teamId,
          player_id: playerId || null,
          manual_player_name: manualPlayerName || null,
          role,
          shirt_number: shirtNumber ? parseInt(shirtNumber) : null,
          position: position || null,
          sort_order: sortOrder ?? 0,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['match-lineups', vars.matchId] }),
  })
}

export function useRemoveMatchLineupPlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, matchId }) => {
      const { error } = await supabase.from('match_lineups').delete().eq('id', id)
      if (error) throw error
      return { matchId }
    },
    onSuccess: ({ matchId }) => qc.invalidateQueries({ queryKey: ['match-lineups', matchId] }),
  })
}
