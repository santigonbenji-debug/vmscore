import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function useOrganizations({ includeArchived = false } = {}) {
  return useQuery({
    queryKey: ['organizations', includeArchived],
    queryFn: async () => {
      let query = supabase
        .from('organizations')
        .select('*')
        .order('province')
        .order('city')
        .order('name')
      if (!includeArchived) query = query.eq('status', 'active')
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        slug: data.slug ? slugify(data.slug) : slugify(`${data.city}-${data.name}`),
        country: data.country || 'Argentina',
        status: data.status || 'active',
      }
      const { data: organization, error } = await supabase
        .from('organizations')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return organization
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

export function useUpdateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }) => {
      const payload = { ...data }
      if (payload.slug) payload.slug = slugify(payload.slug)
      const { error } = await supabase.from('organizations').update(payload).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

export function useArchiveOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }) => {
      const { error } = await supabase.rpc('archive_organization', {
        p_organization_id: id,
        p_reason: reason || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

export function useUnarchiveOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('unarchive_organization', { p_organization_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

export function useSetOrganizationBlocked() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, blocked }) => {
      const { error } = await supabase.rpc('set_organization_blocked', {
        p_organization_id: id,
        p_blocked: blocked,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

export function useArchiveLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }) => {
      const { error } = await supabase.rpc('archive_league', {
        p_league_id: id,
        p_reason: reason || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues'] })
      qc.invalidateQueries({ queryKey: ['standings-all'] })
      qc.invalidateQueries({ queryKey: ['home-matches'] })
    },
  })
}

export function useUnarchiveLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('unarchive_league', { p_league_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
  })
}

export function useApproveLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('approve_league', { p_league_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
  })
}

export function useCreateOrganizationAdmin() {
  return useMutation({
    mutationFn: async ({ organizationId, email, password }) => {
      const { data, error } = await supabase.functions.invoke('create-organization-admin', {
        body: { organizationId, email, password },
      })
      if (error) {
        let message = error.message
        try {
          const payload = await error.context?.json?.()
          message = payload?.error || payload?.message || message
        } catch {
          // Keep Supabase's fallback message when the function did not return JSON.
        }
        throw new Error(message || 'No se pudo crear el acceso.')
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo crear el acceso.')
      return data
    },
  })
}
