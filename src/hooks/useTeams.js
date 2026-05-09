import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// --- QUERIES ---

export function useTeams({ sportId } = {}) {
  return useQuery({
    queryKey: ['teams', sportId],
    queryFn: async () => {
      let q = supabase.from('teams').select('*, sports(id, name, slug)').order('name')
      if (sportId) q = q.eq('sport_id', sportId)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}

export function useTeam(teamId) {
  return useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*, sports(id, name, slug, icon), venues(id, name, address)')
        .eq('id', teamId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!teamId,
  })
}

// --- MUTATIONS ---

// Subir logo a Supabase Storage y retornar la URL pública
async function subirLogo(logoFile, sportId, teamId) {
  const ext  = logoFile.name.split('.').pop()
  const path = `${sportId}/${teamId ?? Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('team-logos')
    .upload(path, logoFile, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('team-logos').getPublicUrl(path)
  return data.publicUrl
}

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ logoFile, ...data }) => {
      // Crear primero para obtener el ID
      const { data: team, error } = await supabase
        .from('teams').insert(data).select().single()
      if (error) throw error
      // Subir logo si se adjuntó
      if (logoFile) {
        const logo_url = await subirLogo(logoFile, data.sport_id, team.id)
        const { error: upErr } = await supabase
          .from('teams').update({ logo_url }).eq('id', team.id)
        if (upErr) throw upErr
      }
      return team
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  })
}

export function useUpdateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, logoFile, ...data }) => {
      if (logoFile) {
        data.logo_url = await subirLogo(logoFile, data.sport_id, id)
      }
      const { error } = await supabase.from('teams').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  })
}

export function useDeleteTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('teams').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  })
}
