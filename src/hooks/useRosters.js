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

export function useTeamCompetitions(teamId) {
  return useQuery({
    queryKey: ['team-competitions', teamId],
    queryFn: async () => {
      if (!teamId) return []
      const { data, error } = await supabase
        .from('league_teams')
        .select('league_id, leagues!inner(id, name, season, year, gender, status, format, competition_type, is_archived, approval_status, sports(id, name, icon))')
        .eq('team_id', teamId)
        .eq('leagues.is_archived', false)
        .eq('leagues.approval_status', 'approved')
      if (error) throw error
      return (data ?? [])
        .map((row) => row.leagues)
        .filter(Boolean)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    },
    enabled: !!teamId,
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
      const { data: phases, error: phasesError } = await supabase
        .from('phases')
        .select('id, type')
        .eq('league_id', leagueId)
      if (phasesError) throw phasesError
      for (const phase of phases ?? []) {
        if (phase.type === 'knockout') continue
        const { error: standingsError } = await supabase.rpc('ensure_managed_standings_rows', { p_phase_id: phase.id })
        if (standingsError) throw standingsError
        const { error: recalcError } = await supabase.rpc('recalculate_managed_standings_phase', { p_phase_id: phase.id })
        if (recalcError) throw recalcError
      }
      return data
    },
    onSuccess: (_, { leagueId }) => {
      qc.invalidateQueries({ queryKey: ['league-teams', leagueId] })
      qc.invalidateQueries({ queryKey: ['standings-edit'] })
      qc.invalidateQueries({ queryKey: ['standings'] })
    },
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

export function useTeamPlayers(teamId, gender) {
  return useQuery({
    queryKey: ['team-players', teamId, gender],
    queryFn: async () => {
      if (!teamId) return []
      let query = supabase
        .from('players')
        .select('*')
        .eq('team_id', teamId)
        .order('display_name')
      if (gender) query = query.eq('gender', gender)
      const { data, error } = await query
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
