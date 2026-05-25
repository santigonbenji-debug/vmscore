import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useReferees({ organizationId, includeArchived = false } = {}) {
  return useQuery({
    queryKey: ['referees', { organizationId, includeArchived }],
    queryFn: async () => {
      let query = supabase
        .from('referees')
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

export function useCreateReferee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data) => {
      const { data: r, error } = await supabase.from('referees').insert(data).select().single()
      if (error) throw error
      return r
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referees'] }),
  })
}

export function useUpdateReferee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }) => {
      const { error } = await supabase.from('referees').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referees'] }),
  })
}

export function useDeleteReferee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('referees').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referees'] }),
  })
}
