import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// --- QUERIES ---

export function useTeams({ sportId, organizationId, includeArchived = false } = {}) {
  return useQuery({
    queryKey: ['teams', sportId, organizationId, includeArchived],
    queryFn: async () => {
      let q = supabase
        .from('teams')
        .select('*, sports(id, name, slug), organizations(id, name, city, province)')
        .order('name')
      if (sportId) q = q.eq('sport_id', sportId)
      if (organizationId) q = q.eq('organization_id', organizationId)
      if (!includeArchived) q = q.eq('is_archived', false)
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
        .select('*, sports(id, name, slug, icon), organizations(id, name, city, province), venues(id, name, address)')
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
  return { logoUrl: data.publicUrl, path }
}

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ logoFile, ...data }) => {
      if (!logoFile) throw new Error('El escudo es obligatorio para crear equipos.')
      const id = crypto.randomUUID()
      const uploadedLogo = await subirLogo(logoFile, data.sport_id, id)
      const { data: team, error } = await supabase
        .from('teams').insert({ id, ...data, logo_url: uploadedLogo.logoUrl }).select().single()
      if (error) {
        await supabase.storage.from('team-logos').remove([uploadedLogo.path])
        throw error
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
        const uploadedLogo = await subirLogo(logoFile, data.sport_id, id)
        data.logo_url = uploadedLogo.logoUrl
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
