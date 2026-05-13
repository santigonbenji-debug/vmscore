import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useStandings({ phaseId, groupId } = {}) {
  return useQuery({
    queryKey: ['standings', phaseId, groupId],
    queryFn: async () => {
      let q = supabase.from('v_standings').select('*').order('position', { ascending: true })
      if (phaseId) q = q.eq('phase_id', phaseId)
      if (groupId) q = q.eq('group_id', groupId)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    enabled: !!phaseId,
  })
}

export function useTeamStandings(teamId) {
  return useQuery({
    queryKey: ['team-standings', teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_standings')
        .select('*')
        .eq('team_id', teamId)
        .order('year', { ascending: false, nullsFirst: false })
        .order('position', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!teamId,
  })
}

export function useTeamStandingsTables(teamId) {
  return useQuery({
    queryKey: ['team-standings-tables', teamId],
    queryFn: async () => {
      const { data: teamRows, error: teamError } = await supabase
        .from('v_standings')
        .select('*')
        .eq('team_id', teamId)
        .order('year', { ascending: false, nullsFirst: false })
        .order('position', { ascending: true })
      if (teamError) throw teamError

      const phases = [...new Set((teamRows ?? []).map((row) => row.phase_id).filter(Boolean))]
      if (phases.length === 0) return []

      const { data: allRows, error } = await supabase
        .from('v_standings')
        .select('*')
        .in('phase_id', phases)
        .order('position', { ascending: true })
      if (error) throw error

      const tables = {}
      ;(allRows ?? []).forEach((row) => {
        const key = `${row.phase_id}-${row.group_id ?? 'general'}`
        if (!tables[key]) {
          tables[key] = {
            key,
            phase_id: row.phase_id,
            league_id: row.league_id,
            league_name: row.league_name,
            phase_name: row.phase_name,
            group_name: row.group_name,
            gender: row.gender,
            team_position: null,
            rows: [],
          }
        }
        tables[key].rows.push(row)
        if (row.team_id === teamId) tables[key].team_position = row
      })

      return Object.values(tables)
        .filter((table) => table.team_position)
        .sort((a, b) => {
          const aYear = a.team_position?.year ?? 0
          const bYear = b.team_position?.year ?? 0
          if (aYear !== bYear) return bYear - aYear
          return (a.team_position?.position ?? 99) - (b.team_position?.position ?? 99)
        })
    },
    enabled: !!teamId,
  })
}
