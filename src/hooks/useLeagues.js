import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// --- QUERIES ---

export function useLeagues({ sportSlug, gender, status, organizationId, includeArchived = false, approvalStatus } = {}) {
  return useQuery({
    queryKey: ['leagues', sportSlug, gender, status, organizationId, includeArchived, approvalStatus],
    queryFn: async () => {
      let q = supabase
        .from('leagues')
        .select('*, sports(id, name, slug, icon), organizations(id, name, slug, city, province, status), champion_team:teams!leagues_champion_team_id_fkey(id, name, short_name, logo_url, primary_color, secondary_color)')
        .order('created_at', { ascending: false })
      if (gender) q = q.eq('gender', gender)
      if (status) q = q.eq('status', status)
      if (organizationId) q = q.eq('organization_id', organizationId)
      if (!includeArchived) q = q.eq('is_archived', false)
      if (approvalStatus) q = q.eq('approval_status', approvalStatus)
      const { data, error } = await q
      if (error) throw error
      if (sportSlug) return (data ?? []).filter((l) => l.sports?.slug === sportSlug)
      return data ?? []
    },
  })
}

export function useLeague(leagueId) {
  return useQuery({
    queryKey: ['league', leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leagues')
        .select('*, sports(id, name, slug, icon), organizations(id, name, slug, city, province, status), champion_team:teams!leagues_champion_team_id_fkey(id, name, short_name, logo_url, primary_color, secondary_color), phases(id, name, type, phase_order, groups(id, name))')
        .eq('id', leagueId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!leagueId,
  })
}

// Fases de una liga ordenadas por phase_order
export function usePhases(leagueId) {
  return useQuery({
    queryKey: ['phases', leagueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phases')
        .select('*')
        .eq('league_id', leagueId)
        .order('phase_order')
      if (error) throw error
      return data ?? []
    },
    enabled: !!leagueId,
  })
}

// --- MUTATIONS ---

// Crear liga + fase por defecto automáticamente
const DEFAULT_PHASE_BY_FORMAT = {
  round_robin: { name: 'Fase Regular', type: 'round_robin' },
  playoffs: { name: 'Cuartos de final', type: 'knockout' },
  championship: { name: 'Fase de Grupos', type: 'groups' },
}

function defaultFormat(competitionType) {
  if (competitionType === 'copa') return 'playoffs'
  if (competitionType === 'torneo') return 'championship'
  return 'round_robin'
}

export function useCreateLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (formData) => {
      const { initial_phase_name, initial_phase_type, ...leagueData } = formData
      const format = leagueData.format ?? defaultFormat(leagueData.competition_type)
      const { data: liga, error } = await supabase
        .from('leagues').insert({ ...leagueData, format }).select().single()
      if (error) throw error
      const initialPhase = DEFAULT_PHASE_BY_FORMAT[format] ?? DEFAULT_PHASE_BY_FORMAT.round_robin

      const { error: phaseError } = await supabase.from('phases').insert({
        league_id: liga.id,
        name: initial_phase_name || initialPhase.name,
        type: initial_phase_type || initialPhase.type,
        phase_order: 1,
      })
      if (phaseError) throw phaseError
      return liga
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
  })
}

export function useUpdateLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }) => {
      const { error } = await supabase.from('leagues').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['leagues'] })
      qc.invalidateQueries({ queryKey: ['league', id] })
    },
  })
}

export function useCreatePhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ league_id, ...phase }) => {
      const { data, error } = await supabase
        .from('phases')
        .insert({ league_id, ...phase })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, phase) => qc.invalidateQueries({ queryKey: ['phases', phase.league_id] }),
  })
}

export function useUpdatePhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, league_id, ...phase }) => {
      const { error } = await supabase.from('phases').update(phase).eq('id', id)
      if (error) throw error
      return { league_id }
    },
    onSuccess: ({ league_id }) => qc.invalidateQueries({ queryKey: ['phases', league_id] }),
  })
}

export function useDeletePhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, league_id }) => {
      const { error } = await supabase.from('phases').delete().eq('id', id)
      if (error) throw error
      return { league_id }
    },
    onSuccess: ({ league_id }) => qc.invalidateQueries({ queryKey: ['phases', league_id] }),
  })
}

export function useDeleteLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('leagues').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
  })
}
