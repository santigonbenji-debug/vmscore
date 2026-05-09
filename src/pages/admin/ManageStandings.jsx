import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLeagues, usePhases } from '../../hooks/useLeagues'
import {
  useStandingsRows,
  useEnsureStandingsRows,
  useUpdateStandingRow,
  useRecalcPhase,
} from '../../hooks/useStandingsAdmin'
import Button  from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import TeamLogo from '../../components/teams/TeamLogo'

const INPUT  = 'rounded px-2 py-1 text-xs text-center bg-surface-800 border border-surface-700 focus:outline-none focus:border-primary disabled:opacity-50'
const BASECOL = ['base_played','base_won','base_drawn','base_lost','base_goals_for','base_goals_against','base_points']

function num(v) { return v === '' || v == null ? 0 : Number(v) }

export default function ManageStandings() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const ligaParam = params.get('liga') ?? ''
  const faseParam = params.get('fase') ?? ''

  const [ligaId, setLigaId] = useState(ligaParam)
  const [faseId, setFaseId] = useState(faseParam)

  const { data: ligas = [], isLoading: lLoading } = useLeagues()
  const { data: fases = [], isLoading: fLoading } = usePhases(ligaId)
  const { data: rows = [],  isLoading: rLoading } = useStandingsRows(faseId)

  const ensure = useEnsureStandingsRows()
  const update = useUpdateStandingRow()
  const recalc = useRecalcPhase()

  // Auto seleccion inicial
  useEffect(() => { if (!ligaId && ligas.length > 0) setLigaId(ligas[0].id) }, [ligas, ligaId])
  useEffect(() => {
    if (fases.length > 0 && !fases.some((f) => f.id === faseId)) setFaseId(fases[0].id)
  }, [fases, faseId])

  // URL sync
  useEffect(() => {
    const next = {}
    if (ligaId) next.liga = ligaId
    if (faseId) next.fase = faseId
    setParams(next, { replace: true })
  }, [ligaId, faseId, setParams])

  const liga = useMemo(() => ligas.find((l) => l.id === ligaId), [ligas, ligaId])

  // Edits locales: edits[rowId] = { base_played, base_won, ... }
  const [edits, setEdits] = useState({})
  const [saveError, setSaveError] = useState(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => { setEdits({}); setSaveError(null) }, [faseId, rows.length])

  const rowsOrdenadas = useMemo(() => {
    return [...rows].sort((a, b) => {
      const pa = a.position ?? 99
      const pb = b.position ?? 99
      if (pa !== pb) return pa - pb
      return (b.points ?? 0) - (a.points ?? 0)
    })
  }, [rows])

  function setBase(rowId, key, raw) {
    setEdits((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] ?? {}),
        [key]: raw === '' ? '' : parseInt(raw, 10),
      },
    }))
  }

  function getBase(row, key) {
    const e = edits[row.id]
    if (e && Object.prototype.hasOwnProperty.call(e, key)) return e[key]
    return row[key] ?? 0
  }

  // Stats calculados desde matches = total - base
  function getCalc(row, baseKey) {
    const totalKey = baseKey.replace(/^base_/, '')
    return num(row[totalKey]) - num(row[baseKey])
  }

  const dirtyIds = useMemo(() => Object.keys(edits).filter((id) => {
    const e = edits[id] ?? {}
    return Object.keys(e).length > 0
  }), [edits])

  async function handleSync() {
    setSaveError(null)
    try {
      await ensure.mutateAsync(faseId)
      await recalc.mutateAsync(faseId)
    } catch (err) {
      setSaveError(err?.message ?? 'No se pudieron sincronizar los equipos')
    }
  }

  async function handleRecalc() {
    setSaveError(null)
    try {
      await recalc.mutateAsync(faseId)
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2500)
    } catch (err) {
      setSaveError(err?.message ?? 'No se pudo recalcular la tabla')
    }
  }

  async function saveAll() {
    setSaveError(null); setSavedFlash(false)
    try {
      for (const rowId of dirtyIds) {
        const row = rows.find((r) => r.id === rowId)
        if (!row) continue
        const baseValues = {}
        for (const k of BASECOL) baseValues[k] = num(getBase(row, k))
        await update.mutateAsync({ id: rowId, phaseId: faseId, baseValues })
      }
      // Recalcular toda la fase para que los totales y posiciones queden consistentes
      await recalc.mutateAsync(faseId)
      setEdits({})
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch (err) {
      setSaveError(err?.message ?? 'No se pudo guardar. Revisá tus permisos de admin.')
    }
  }

  const guardando = update.isPending || ensure.isPending || recalc.isPending

  return (
    <div className="px-3 py-5 pb-28 space-y-4">
      <div>
        <button onClick={() => navigate('/admin/ligas')}
          className="text-primary text-sm font-medium hover:underline">← Ligas</button>
      </div>

      <div>
        <h1 className="text-xl font-extrabold text-zinc-100">Tabla de posiciones</h1>
        <p className="text-xs text-zinc-500 mt-1">
          Cargá el <strong>histórico</strong> de cada equipo (lo jugado antes del sistema).
          Los partidos cargados en la app se suman automáticamente a estos valores.
        </p>
      </div>

      {/* Selector liga + fase */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">Liga</label>
          <select value={ligaId} onChange={(e) => { setLigaId(e.target.value); setFaseId('') }}
            className="w-full rounded-lg px-3 py-2 text-sm">
            <option value="">Seleccioná una liga</option>
            {ligas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.sports?.icon} {l.name}{l.season ? ` · ${l.season}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">Fase</label>
          <select value={faseId} onChange={(e) => setFaseId(e.target.value)}
            disabled={!fases.length}
            className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-40">
            <option value="">{fases.length ? 'Seleccioná una fase' : 'Sin fases'}</option>
            {fases.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Acciones de fase */}
      {faseId && (
        <div className="flex items-center justify-between gap-3 bg-surface-900 border border-surface-800 rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-300">
              {rowsOrdenadas.length} equipo{rowsOrdenadas.length === 1 ? '' : 's'} en esta fase.
            </p>
            <p className="text-[11px] text-zinc-500">
              Si agregás equipos a la liga, sincronizá. Si los partidos no se reflejan, recalculá.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="secondary" onClick={handleRecalc} disabled={guardando}>
              {recalc.isPending ? '...' : 'Recalcular'}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleSync} disabled={guardando}>
              {ensure.isPending ? '...' : 'Sincronizar'}
            </Button>
          </div>
        </div>
      )}

      {saveError && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs rounded-xl px-3 py-2">
          ⚠ {saveError}
        </div>
      )}
      {savedFlash && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl px-3 py-2">
          ✓ Cambios guardados y tabla recalculada
        </div>
      )}

      {/* Grilla */}
      {faseId && (
        <>
          {(lLoading || fLoading || rLoading) && <Spinner className="py-12" />}
          {!rLoading && rowsOrdenadas.length === 0 && (
            <div className="text-center py-10 text-zinc-500 text-sm">
              <p>No hay equipos en esta fase todavía.</p>
              <p className="text-xs text-zinc-600 mt-1">Tocá "Sincronizar" para traer los equipos de la liga.</p>
            </div>
          )}
          {rowsOrdenadas.length > 0 && (
            <div className="bg-surface-900 rounded-xl border border-surface-800 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-800 text-zinc-400 text-[10px] uppercase tracking-wide">
                  <tr>
                    <th className="px-1.5 py-2 text-center">Pos</th>
                    <th className="px-2 py-2 text-left">Equipo</th>
                    <th className="px-1 py-2 text-center font-bold">Pts base</th>
                    <th className="px-1 py-2 text-center">PJ base</th>
                    <th className="px-1 py-2 text-center">G base</th>
                    <th className="px-1 py-2 text-center">E base</th>
                    <th className="px-1 py-2 text-center">P base</th>
                    <th className="px-1 py-2 text-center">GF base</th>
                    <th className="px-1 py-2 text-center">GC base</th>
                    <th className="px-2 py-2 text-center" title="Stats sumados de los partidos jugados en la app">+ Sistema</th>
                    <th className="px-2 py-2 text-center font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsOrdenadas.map((row) => {
                    const isDirty = !!edits[row.id] && Object.keys(edits[row.id]).length > 0
                    const calc = {
                      played: getCalc(row, 'base_played'),
                      won:    getCalc(row, 'base_won'),
                      drawn:  getCalc(row, 'base_drawn'),
                      lost:   getCalc(row, 'base_lost'),
                      gf:     getCalc(row, 'base_goals_for'),
                      ga:     getCalc(row, 'base_goals_against'),
                      pts:    getCalc(row, 'base_points'),
                    }
                    const totalPts = num(getBase(row, 'base_points')) + calc.pts
                    const totalPJ  = num(getBase(row, 'base_played')) + calc.played
                    return (
                      <tr key={row.id} className={`border-t border-surface-800 ${isDirty ? 'bg-primary/5' : ''}`}>
                        <td className="px-1.5 py-1.5 text-center text-xs text-zinc-300 font-bold">
                          {row.position ?? '-'}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <TeamLogo logoUrl={row.team_logo_url} name={row.team_name} color={row.primary_color} />
                            <span className="text-xs text-zinc-100 truncate">
                              {row.team_short_name ?? row.team_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-1.5">
                          <input type="number" value={getBase(row, 'base_points')}
                            onChange={(e) => setBase(row.id, 'base_points', e.target.value)}
                            className={`${INPUT} w-12 font-bold`} />
                        </td>
                        <td className="px-1 py-1.5">
                          <input type="number" value={getBase(row, 'base_played')}
                            onChange={(e) => setBase(row.id, 'base_played', e.target.value)}
                            className={`${INPUT} w-12`} />
                        </td>
                        <td className="px-1 py-1.5">
                          <input type="number" value={getBase(row, 'base_won')}
                            onChange={(e) => setBase(row.id, 'base_won', e.target.value)}
                            className={`${INPUT} w-12`} />
                        </td>
                        <td className="px-1 py-1.5">
                          <input type="number" value={getBase(row, 'base_drawn')}
                            onChange={(e) => setBase(row.id, 'base_drawn', e.target.value)}
                            className={`${INPUT} w-12`} />
                        </td>
                        <td className="px-1 py-1.5">
                          <input type="number" value={getBase(row, 'base_lost')}
                            onChange={(e) => setBase(row.id, 'base_lost', e.target.value)}
                            className={`${INPUT} w-12`} />
                        </td>
                        <td className="px-1 py-1.5">
                          <input type="number" value={getBase(row, 'base_goals_for')}
                            onChange={(e) => setBase(row.id, 'base_goals_for', e.target.value)}
                            className={`${INPUT} w-12`} />
                        </td>
                        <td className="px-1 py-1.5">
                          <input type="number" value={getBase(row, 'base_goals_against')}
                            onChange={(e) => setBase(row.id, 'base_goals_against', e.target.value)}
                            className={`${INPUT} w-12`} />
                        </td>
                        <td className="px-2 py-1.5 text-center text-[10px] text-zinc-500 tabular-nums whitespace-nowrap">
                          {calc.played > 0
                            ? `${calc.played}PJ · ${calc.pts}pts`
                            : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-center text-xs font-bold text-zinc-100 tabular-nums whitespace-nowrap">
                          {totalPts}pts
                          <div className="text-[10px] text-zinc-500 font-normal">{totalPJ} jug</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Barra Guardar todo */}
          {rowsOrdenadas.length > 0 && (
            <div className="sticky bottom-16 sm:bottom-3 z-30 flex items-center justify-between gap-3 bg-surface-900/95 backdrop-blur border border-surface-800 rounded-xl px-4 py-3 shadow-lg">
              <p className="text-xs text-zinc-300">
                {dirtyIds.length === 0
                  ? 'Editá los valores base y los totales se actualizan al guardar.'
                  : `${dirtyIds.length} equipo${dirtyIds.length === 1 ? '' : 's'} con cambios sin guardar.`}
              </p>
              <Button onClick={saveAll} disabled={dirtyIds.length === 0 || guardando}>
                {update.isPending || recalc.isPending ? 'Guardando...' : 'Guardar y recalcular'}
              </Button>
            </div>
          )}

          {liga && (
            <p className="text-[11px] text-zinc-500 px-1">
              {liga.sports?.icon} {liga.name}{liga.season ? ` · ${liga.season}` : ''}
            </p>
          )}
        </>
      )}
    </div>
  )
}
