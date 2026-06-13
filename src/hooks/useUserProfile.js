import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useUserProfile(userId) {
  return useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, favorite_team:teams(id, name, short_name, logo_url, primary_color)')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })
}

export function useSaveUserProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, displayName, favoriteTeamId, avatarStyle = {} }) => {
      if (!userId) throw new Error('Necesitas iniciar sesion.')
      const payload = {
        user_id: userId,
        display_name: displayName?.trim() || null,
        favorite_team_id: favoriteTeamId || null,
        avatar_style: avatarStyle,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*, favorite_team:teams(id, name, short_name, logo_url, primary_color)')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (profile) => {
      qc.invalidateQueries({ queryKey: ['user-profile', profile.user_id] })
    },
  })
}
