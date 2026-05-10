import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const QUERY_PREFIXES = [
  ['home-matches'],
  ['matches'],
  ['matches-all'],
  ['matches-home'],
  ['matches-by-date'],
  ['match'],
  ['team-matches'],
  ['fav-matches'],
  ['standings'],
  ['standings-all'],
  ['scorers-all'],
  ['top-scorers'],
]

export function useRealtimeInvalidation() {
  const queryClient = useQueryClient()

  useEffect(() => {
    function refreshAppData() {
      for (const queryKey of QUERY_PREFIXES) {
        queryClient.invalidateQueries({ queryKey })
      }
    }

    const channel = supabase
      .channel('vmscore-live-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, refreshAppData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events' }, refreshAppData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'standings' }, refreshAppData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manual_scorers' }, refreshAppData)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
