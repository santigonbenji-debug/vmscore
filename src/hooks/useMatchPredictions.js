import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useMyMatchPrediction(matchId, userId) {
  return useQuery({
    queryKey: ['match-prediction', matchId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_predictions')
        .select('*')
        .eq('match_id', matchId)
        .eq('user_id', userId)
        .eq('source', 'social')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!matchId && !!userId,
  })
}

export function useMatchPredictionSummary(matchId) {
  return useQuery({
    queryKey: ['match-prediction-summary', matchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_match_prediction_summary', {
        p_match_id: matchId,
      })
      if (error) throw error
      return {
        home: Number(data?.find((row) => row.prediction === 'home')?.total ?? 0),
        draw: Number(data?.find((row) => row.prediction === 'draw')?.total ?? 0),
        away: Number(data?.find((row) => row.prediction === 'away')?.total ?? 0),
      }
    },
    enabled: !!matchId,
  })
}

export function useSaveMatchPrediction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matchId, userId, prediction }) => {
      if (!matchId || !userId) throw new Error('Necesitas iniciar sesion para votar.')
      if (!['home', 'draw', 'away'].includes(prediction)) throw new Error('Pronostico invalido.')

      const { data, error } = await supabase
        .from('match_predictions')
        .upsert(
          {
            match_id: matchId,
            user_id: userId,
            prediction,
            source: 'social',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'match_id,user_id,source' },
        )
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (prediction) => {
      qc.invalidateQueries({ queryKey: ['match-prediction', prediction.match_id, prediction.user_id] })
      qc.invalidateQueries({ queryKey: ['match-prediction-summary', prediction.match_id] })
    },
  })
}
