import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // React Native — nunca true
  },
})

// Tipos das tabelas
export type User = {
  id: string
  email: string
  nome: string | null
  genero: string | null
  idade: number | null
  tipo_pele: string | null
  concerns: string[]
  objetivo: string | null
  plano: string | null
  created_at: string
}

export type SkinScan = {
  id: string
  user_id: string
  foto_url: string
  skin_score: number
  tipo_pele: string
  metricas: Record<string, { score: number; label: string; insight: string }>
  areas_atencao: string[]
  resumo: string
  created_at: string
}

export type FoodScan = {
  id: string
  user_id: string
  foto_url: string
  alimentos: Array<{
    name: string
    impact: string
    evidence: string
    mechanism: string
  }>
  nota_geral: string
  explicacao: string
  sugestoes: string[]
  created_at: string
}

export type Protocolo = {
  id: string
  user_id: string
  skin_scan_id: string
  rotina_am: Array<{
    category: string
    product_type: string
    active_ingredient: string
    why: string
    product_suggestions: string[]
  }>
  rotina_pm: Array<{
    category: string
    product_type: string
    active_ingredient: string
    why: string
    product_suggestions: string[]
  }>
  dicas: string[]
  updated_at: string
}

export type Subscription = {
  id: string
  user_id: string
  plano: string
  status: string
  start_date: string
  end_date: string
  rc_customer_id: string
}