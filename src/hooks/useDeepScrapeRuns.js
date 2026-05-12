import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useDeepScrapeRuns() {
  return useQuery({
    queryKey: ['deep-scrape-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_scrape_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateDeepScrapeRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (snapshot) => {
      const { data: authData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('external_scrape_runs')
        .insert({
          provider: snapshot.provider,
          source_url: snapshot.source_url,
          event_code: snapshot.event_code,
          division_code: snapshot.division_code,
          mode: snapshot.mode,
          status: 'completed',
          extracted: snapshot.extracted,
          raw: snapshot.raw,
          created_by: authData?.user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deep-scrape-runs'] }),
  })
}

export function useUpdateDeepScrapeRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }) => {
      const { error } = await supabase
        .from('external_scrape_runs')
        .update({
          ...values,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deep-scrape-runs'] }),
  })
}
