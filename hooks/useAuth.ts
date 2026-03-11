import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { Session } from '@supabase/supabase-js'

// Client ID iOS gerado no Google Cloud Console
GoogleSignin.configure({
  iosClientId: '436683236946-36te4gp3c6eid9frheokli00j0pnocd4.apps.googleusercontent.com',
  webClientId: '436683236946-lcml5qhbf6iudovdfbu6u9nrmveduv7i.apps.googleusercontent.com',
})

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async (): Promise<Session> => {
    try {
      setLoading(true)

      await GoogleSignin.hasPlayServices()
      const userInfo = await GoogleSignin.signIn()
      const idToken = userInfo.data?.idToken

      if (!idToken) throw new Error('Sem token do Google')

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      })

      if (error) throw error
      if (!data.session) throw new Error('Sessão não retornada pelo Supabase')

      return data.session
    } catch (error) {
      console.error('Erro no Google Sign In:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      await GoogleSignin.signOut()
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Erro no logout:', error)
    }
  }

  return {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle,
    signOut,
  }
}