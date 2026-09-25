import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { Session } from '@supabase/supabase-js'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { clearAllCache } from '../lib/cache'
import { resetUserId } from '../lib/currentUser'
import { useAppStore } from '../store/onboarding'

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

  // ⚠️ O cache de dados (lib/cache) e o store persistido são POR USUÁRIO. Sair sem
  // limpá-los faria a próxima conta a logar neste aparelho abrir vendo o score, a
  // rotina e o nome da conta anterior. Sempre limpar os dois no logout.
  const clearLocalData = async () => {
    resetUserId()
    useAppStore.persist.clearStorage()
    useAppStore.getState().reset()
    // ⚠️ `persist.clearStorage()` limpa o DISCO, não o estado em memória — e o
    // `reset()` não toca nos flags do tutorial. Sem esta linha, o `homeTutorialSeen`
    // da conta anterior sobrevivia nesta sessão do app e a PRÓXIMA conta criada
    // aqui nunca veria o tutorial da home (e ainda herdava o `seen: true` no disco).
    // ⚠️ Só os flags da HOME: `scanTutorialSeen` fica de fora de propósito — zerá-lo
    // faria quem sai e volta na MESMA conta rever o tutorial das 6 fotos.
    useAppStore.getState().clearHomeTutorialFlags()
    await clearAllCache()
  }

  const signOut = async () => {
    try {
      await GoogleSignin.signOut()
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Erro no logout:', error)
    } finally {
      await clearLocalData()
    }
  }

  const deleteAccount = async () => {
    // Era `supabase.rpc('delete_user')`, que apagava as tabelas (cascata de
    // auth.users) mas deixava as FOTOS DE ROSTO para trás nos buckets do Storage.
    // A Edge Function remove os arquivos pela API de Storage (.remove apaga os
    // bytes, não só o registro) ANTES de apagar o usuário.
    // ⚠️ A RPC `delete_user` continua viva no banco de propósito: as builds
    // antigas em produção ainda a chamam. Não remover até a base ter migrado.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sessão expirada. Entre novamente para apagar a conta.')

    const { error } = await supabase.functions.invoke('delete-account')
    // Se a limpeza dos arquivos falhou, a conta NÃO foi apagada. Propagar o erro
    // é essencial: sem isso seguíamos para o signOut e a pessoa saía achando que
    // tinha apagado tudo, quando nada foi apagado.
    if (error) throw error

    try { await GoogleSignin.signOut() } catch {}
    await supabase.auth.signOut()
    await clearLocalData()
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