import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profil, setProfil] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfil(session === null ? null : undefined)
      return
    }
    supabase.from('ads_users').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setProfil(data || null))
  }, [session])

  const rolle = profil?.rolle
  const wert = {
    session,
    profil,
    rolle,
    darfBedienen: rolle === 'admin' || rolle === 'expansion',
    istAdmin: rolle === 'admin',
    abmelden: () => supabase.auth.signOut(),
  }
  return <AuthContext.Provider value={wert}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
