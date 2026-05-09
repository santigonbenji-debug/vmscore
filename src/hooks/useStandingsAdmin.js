// Hooks para edicion del HISTORICO BASE de la tabla de posiciones.
// Modelo: standings.base_* + stats calculados desde matches = total mostrado.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const BASE_COLUMNS = [
  'base_played',
  'base_won',
  'base_drawn',
  'base_lost',
  'base_goals_for',
  'base_goals_against',
  'base_points',
]

// Lee filas de standings (incluye base + total) para una fase
export function useStandingsRows(phaseId) {
  return useQuery({
    queryKey: ['standings-edit', phaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_standings')
        .select('*')
        .eq('phase_id', phaseId)
        .order('position', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!phaseId,
  })
}

// Garantiza filas para todos los equipos inscriptos en la fase
export function useEnsureStandingsRows() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (phaseId) => {
      const { error } = await supabase.rpc('ensure_standings_rows', { p_phase_id: phaseId })
      if (error) throw error
    },
    onSuccess: (_, phaseId) => {
      qc.invalidateQueries({ queryKey: ['standings-edit', phaseId] })
      qc.invalidateQueries({ queryKey: ['standings-all'] })
    },
  })
}

// Recalcula la tabla (suma base + matches y reordena)
export function useRecalcPhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (phaseId) => {
      const { error } = await supabase.rpc('recalcular_standings_phase', { v_phase_id: phaseId })
      if (error) throw error
      return phaseId
    },
    onSuccess: (phaseId) => {
      qc.invalidateQueries({ queryKey: ['standings-edit', phaseId] })
      qc.invalidateQueries({ queryKey: ['standings-all'] })
      qc.invalidateQueries({ queryKey: ['standings'] })
    },
  })
}

// Actualiza UNA fila: solo columnas base, despues llamar recalc
export function useUpdateStandingRow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, phaseId, baseValues }) => {
      const clean = {}
      for (const k of BASE_COLUMNS) {
        if (Object.prototype.hasOwnProperty.call(baseValues, k)) {
          const v = baseValues[k]
          clean[k] = v === '' || v == null ? 0 : Number(v)
        }
      }
      const { error } = await supabase.from('standings').update(clean).eq('id', id)
      if (error) throw error
      return { phaseId }
    },
    onSuccess: ({ phaseId }) => {
      qc.invalidateQueries({ queryKey: ['standings-edit', phaseId] })
    },
  })
}
