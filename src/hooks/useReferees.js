import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useReferees() {
  return useQuery({
    queryKey: ['referees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('referees').select('*').order('name')
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
