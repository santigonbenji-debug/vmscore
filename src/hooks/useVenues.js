import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useVenues({ organizationId, includeArchived = false } = {}) {
  return useQuery({
    queryKey: ['venues', { organizationId, includeArchived }],
    queryFn: async () => {
      let query = supabase
        .from('venues')
        .select('*, organizations(id, name, city, province, status)')
        .order('name')

      if (organizationId) query = query.eq('organization_id', organizationId)
      if (!includeArchived) query = query.or('is_archived.is.null,is_archived.eq.false')

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateVenue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data) => {
      const { data: v, error } = await supabase.from('venues').insert(data).select().single()
      if (error) throw error
      return v
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venues'] }),
  })
}

export function useUpdateVenue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }) => {
      const { error } = await supabase.from('venues').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venues'] }),
  })
}

export function useDeleteVenue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('venues').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['venues'] }),
  })
}
