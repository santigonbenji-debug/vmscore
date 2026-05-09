import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useLeagueTeams(leagueId) {
  return useQuery({
    queryKey: ['league-teams', leagueId],
    queryFn: async () => {
      if (!leagueId) return []
      const { data, error } = await supabase
        .from('v_league_teams')
        .select('*')
        .eq('league_id', leagueId)
        .order('team_name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!leagueId,
  })
}

export function useAddTeamToLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ leagueId, teamId }) => {
      const { data, error } = await supabase
        .from('league_teams')
        .upsert({ league_id: leagueId, team_id: teamId }, { onConflict: 'league_id,team_id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, { leagueId }) => qc.invalidateQueries({ queryKey: ['league-teams', leagueId] }),
  })
}

export function useRemoveTeamFromLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ leagueId, leagueTeamId }) => {
      const { error } = await supabase.from('league_teams').delete().eq('id', leagueTeamId)
      if (error) throw error
      return { leagueId }
    },
    onSuccess: ({ leagueId }) => qc.invalidateQueries({ queryKey: ['league-teams', leagueId] }),
  })
}

export function useTeamPlayers(teamId) {
  return useQuery({
    queryKey: ['team-players', teamId],
    queryFn: async () => {
      if (!teamId) return []
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('team_id', teamId)
        .order('display_name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!teamId,
  })
}

export function useCreatePlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (player) => {
      let { data, error } = await supabase.from('players').insert(player).select().single()
      if (error && error.message?.includes("gender")) {
        const fallback = { ...player }
        delete fallback.gender
        const retry = await supabase.from('players').insert(fallback).select().single()
        data = retry.data
        error = retry.error
      }
      if (error) throw error
      return data
    },
    onSuccess: (_, player) => qc.invalidateQueries({ queryKey: ['team-players', player.team_id] }),
  })
}

export function useUpdatePlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, team_id, ...data }) => {
      let { error } = await supabase.from('players').update(data).eq('id', id)
      if (error && error.message?.includes("gender")) {
        const fallback = { ...data }
        delete fallback.gender
        const retry = await supabase.from('players').update(fallback).eq('id', id)
        error = retry.error
      }
      if (error) throw error
      return { team_id }
    },
    onSuccess: ({ team_id }) => qc.invalidateQueries({ queryKey: ['team-players', team_id] }),
  })
}

export function useDeletePlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, team_id }) => {
      const { error } = await supabase.from('players').delete().eq('id', id)
      if (error) throw error
      return { team_id }
    },
    onSuccess: ({ team_id }) => qc.invalidateQueries({ queryKey: ['team-players', team_id] }),
  })
}

export function useTeamStaff(teamId) {
  return useQuery({
    queryKey: ['team-staff', teamId],
    queryFn: async () => {
      if (!teamId) return []
      const { data, error } = await supabase
        .from('staff_members')
        .select('*')
        .eq('team_id', teamId)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!teamId,
  })
}

export function useCreateStaffMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (staff) => {
      const { data, error } = await supabase.from('staff_members').insert(staff).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, staff) => qc.invalidateQueries({ queryKey: ['team-staff', staff.team_id] }),
  })
}
