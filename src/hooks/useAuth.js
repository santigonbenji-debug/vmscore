import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser]         = useState(null)
  const [role, setRole]         = useState(null)
  const [leagueId, setLeagueId] = useState(null)
  const [teamId, setTeamId]     = useState(null)
  const [organizationId, setOrganizationId] = useState(null)
  const [organization, setOrganization] = useState(null)
  const [loading, setLoading]   = useState(true)

  const fetchRole = useCallback(async (userId) => {
    const { data } = await supabase
      .from('admin_roles')
      .select('role, league_id, team_id, organization_id, status, organizations(id, name, slug, city, province, status, archive_reason)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)

    const r = Array.isArray(data) ? data[0] : null
    setRole(r?.role ?? null)
    setLeagueId(r?.league_id ?? null)
    setTeamId(r?.team_id ?? null)
    setOrganizationId(r?.organization_id ?? null)
    setOrganization(r?.organizations ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchRole(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) fetchRole(session.user.id)
        else {
          setRole(null); setLeagueId(null)
          setTeamId(null); setOrganizationId(null); setOrganization(null); setLoading(false)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [fetchRole])

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function resetPassword(email) {
    const redirectTo = `${window.location.origin}/admin/reset-password`
    return supabase.auth.resetPasswordForEmail(email, { redirectTo })
  }

  async function updatePassword(password) {
    return supabase.auth.updateUser({ password })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return {
    user,
    role,
    leagueId,
    teamId,
    organizationId,
    organization,
    isAdmin:      !!role,
    isSuperAdmin: role === 'superadmin',
    isOrganizationAdmin: role === 'organization_admin',
    isLigaAdmin:  role === 'liga_admin',
    isClubAdmin:  role === 'club_admin',
    isMatchModerator: role === 'match_moderator',
    loading,
    signIn,
    resetPassword,
    updatePassword,
    signOut,
  }
}
