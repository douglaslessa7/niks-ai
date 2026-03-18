import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { Session } from '@supabase/supabase-js'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'

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

  const signInWithApple = async (): Promise<{ user: { id: string } } | null> => {
    try {
      setLoading(true)

      const rawNonce = Math.random().toString(36).substring(2)
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      )

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      })

      if (!credential.identityToken) throw new Error('Sem identity token da Apple')

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      })

      if (error) throw error

      // Apple só retorna o nome no PRIMEIRO login — capturar aqui
      if (credential.fullName?.givenName && data.user) {
        const nome = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ')
        await supabase.from('users').update({ nome }).eq('id', data.user.id)
      }

      return data
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') return null
      console.error('Erro no Apple Sign In:', e)
      throw e
    } finally {
      setLoading(false)
    }
  }

  const signInWithEmail = async (email: string, password: string): Promise<Session> => {
    try {
      setLoading(true)
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (!data.session) throw new Error('Sessão não retornada pelo Supabase')
      return data.session
    } catch (error) {
      console.error('Erro no login com e-mail:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signUpWithEmail = async (email: string, password: string): Promise<Session> => {
    try {
      setLoading(true)
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      if (!data.session) throw new Error('Sessão não retornada pelo Supabase')
      return data.session
    } catch (error) {
      console.error('Erro no cadastro com e-mail:', error)
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

  const deleteAccount = async () => {
    await supabase.rpc('delete_user')
    try { await GoogleSignin.signOut() } catch {}
    await supabase.auth.signOut()
  }

  return {
    session,
    user: session?.user ?? null,
    loading,
    signInWithGoogle,
    signInWithApple,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    deleteAccount,
  }
}