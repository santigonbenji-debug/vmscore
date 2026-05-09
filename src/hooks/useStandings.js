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
