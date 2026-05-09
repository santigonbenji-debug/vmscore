import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser]         = useState(null)
  const [role, setRole]         = useState(null)
  const [leagueId, setLeagueId] = useState(null)
  const [teamId, setTeamId]     = useState(null)
  const [loading, setLoading]   = useState(true)

  const fetchRole = useCallback(async (userId) => {
    const { data } = await supabase
      .from('admin_roles')
      .select('role, league_id, team_id')
      .eq('user_id', userId)
      .limit(1)

    const r = Array.isArray(data) ? data[0] : null
    setRole(r?.role ?? null)
    setLeagueId(r?.league_id ?? null)
    setTeamId(r?.team_id ?? null)
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
          setTeamId(null); setLoading(false)
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
    isAdmin:      !!role,
    isSuperAdmin: role === 'superadmin',
    isLigaAdmin:  role === 'liga_admin',
    isClubAdmin:  role === 'club_admin',
    loading,
    signIn,
    resetPassword,
    updatePassword,
    signOut,
  }
}
