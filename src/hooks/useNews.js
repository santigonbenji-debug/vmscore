import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Noticias visibles para el público (publish_at <= now())
export function useNews({ limit = 10 } = {}) {
  return useQuery({
    queryKey: ['news', 'public', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news')
        .select(`
          id, title, body, image_url, link_url, pinned, publish_at,
          created_at, match_id, team_id, league_id,
          teams ( id, name, short_name, logo_url, primary_color ),
          leagues ( id, name )
        `)
        .lte('publish_at', new Date().toISOString())
        .order('pinned', { ascending: false })
        .order('publish_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
    refetchInterval: 5 * 60 * 1000,
  })
}

// Todas las noticias (admin)
export function useAllNews() {
  return useQuery({
    queryKey: ['news', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news')
        .select(`
          id, title, body, image_url, link_url, pinned, publish_at, created_at,
          match_id, team_id, league_id,
          teams ( id, name, short_name ),
          leagues ( id, name )
        `)
        .order('pinned', { ascending: false })
        .order('publish_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateNews() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('news')
        .insert(payload)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['news'] })
    },
  })
}

export function useUpdateNews() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase
        .from('news')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['news'] })
    },
  })
}

export function useDeleteNews() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('news').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['news'] })
    },
  })
}
