import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useMatchModerators() {
  return useQuery({
    queryKey: ['match-moderators'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_match_moderators')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateMatchModerator() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ leagueIds, email, password, displayName }) => {
      const normalizedLeagueIds = Array.isArray(leagueIds) ? leagueIds.filter(Boolean) : []
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const { data, error } = await supabase.functions.invoke('create-match-moderator', {
        body: {
          leagueId: normalizedLeagueIds[0],
          leagueIds: normalizedLeagueIds,
          email,
          password,
          displayName,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (error) {
        let message = error.message
        try {
          const payload = await error.context?.json?.()
          message = payload?.error || payload?.message || message
        } catch {
          // Keep Supabase's fallback message when the function did not return JSON.
        }
        throw new Error(message || 'No se pudo crear el moderador.')
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo crear el moderador.')
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match-moderators'] }),
  })
}

export function useSetMatchModeratorLeagues() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, leagueIds }) => {
      const { error } = await supabase.rpc('set_match_moderator_leagues', {
        p_user_id: userId,
        p_league_ids: leagueIds,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match-moderators'] }),
  })
}

export function useMyModeratorLeagues() {
  return useQuery({
    queryKey: ['my-moderator-leagues'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_moderator_leagues')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useSetMatchModeratorStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, status }) => {
      const { error } = await supabase.rpc('set_match_moderator_status', {
        p_user_id: userId,
        p_status: status,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['match-moderators'] }),
  })
}
