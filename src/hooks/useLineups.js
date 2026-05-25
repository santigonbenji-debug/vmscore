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

export function useAddActiveRosterToMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matchId, teamId, players }) => {
      const activePlayers = (players ?? []).filter((player) => player.is_active !== false)
      if (activePlayers.length === 0) return { matchId, added: 0 }

      const { data: existing, error: existingError } = await supabase
        .from('match_lineups')
        .select('player_id')
        .eq('match_id', matchId)
        .eq('team_id', teamId)
        .not('player_id', 'is', null)
      if (existingError) throw existingError

      const existingIds = new Set((existing ?? []).map((row) => row.player_id))
      const newPlayers = activePlayers.filter((player) => !existingIds.has(player.id))
      if (newPlayers.length === 0) return { matchId, added: 0 }

      const { error } = await supabase.from('match_lineups').insert(
        newPlayers.map((player, index) => ({
          match_id: matchId,
          team_id: teamId,
          player_id: player.id,
          role: 'called_up',
          shirt_number: player.shirt_number ?? null,
          position: player.position ?? null,
          sort_order: index,
        }))
      )
      if (error) throw error
      return { matchId, added: newPlayers.length }
    },
    onSuccess: ({ matchId }) => qc.invalidateQueries({ queryKey: ['match-lineups', matchId] }),
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
