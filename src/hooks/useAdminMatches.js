import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useTeamMatches(teamId) {
  return useQuery({
    queryKey: ['team-matches', teamId],
    queryFn: async () => {
      if (!teamId) return []
      const { data, error } = await supabase
        .from('v_matches')
        .select('*')
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order('scheduled_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!teamId,
  })
}

export function useFinishedMatchesForMvp() {
  return useQuery({
    queryKey: ['finished-matches-for-mvp'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_matches')
        .select('id, home_team_id, away_team_id, home_team_name, away_team_name, home_team_short_name, away_team_short_name, league_name, scheduled_at, mvp_player_name, mvp_team_id')
        .eq('status', 'finished')
        .order('scheduled_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useUpdateMatchMvp() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ matchId, playerName, teamId }) => {
      const { error } = await supabase
        .from('matches')
        .update({
          mvp_player_name: playerName,
          mvp_team_id: teamId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', matchId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finished-matches-for-mvp'] })
      qc.invalidateQueries({ queryKey: ['leagues-home-data'] })
      qc.invalidateQueries({ queryKey: ['matches'] })
      qc.invalidateQueries({ queryKey: ['matches-home'] })
    },
  })
}
