import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// --- QUERIES ---

export function useLeagues({ sportSlug, gender, status, organizationId, includeArchived = false, approvalStatus } = {}) {
  return useQuery({
    queryKey: ['leagues', sportSlug, gender, status, organizationId, includeArchived, approvalStatus],
    queryFn: async () => {
      let q = supabase
        .from('leagues')
        .select('*, sports(id, name, slug, icon), organizations(id, name, slug, city, province, status)')
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
        .select('*, sports(id, name, slug, icon), organizations(id, name, slug, city, province, status), phases(id, name, type, phase_order, groups(id, name))')
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
export function useCreateLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (formData) => {
      const { data: liga, error } = await supabase
        .from('leagues').insert(formData).select().single()
      if (error) throw error
      const phaseByCompetition = {
        liga: { name: 'Fase Regular', type: 'round_robin' },
        copa: { name: 'Eliminatorias', type: 'playoffs' },
        torneo: { name: 'Fase Inicial', type: 'championship' },
      }
      const initialPhase = phaseByCompetition[formData.competition_type] ?? phaseByCompetition.liga

      // Cada formato nace con una fase coherente; las llaves automaticas se agregaran aparte.
      const { error: phaseError } = await supabase.from('phases').insert({
        league_id: liga.id, name: initialPhase.name, type: initialPhase.type, phase_order: 1,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
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
