import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLeagues, usePhases } from '../../hooks/useLeagues'
import { useLeagueTeams, useTeamPlayers } from '../../hooks/useRosters'
import {
  useManualScorers,
  useUpsertManualScorer,
  useDeleteManualScorer,
} from '../../hooks/useScorersAdmin'
import Button  from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import TeamLogo from '../../components/teams/TeamLogo'

function PlayerOptions({ teamId, onSelect, current, gender }) {
  const { data: players = [] } = useTeamPlayers(teamId)
  const filteredPlayers = players.filter((p) =>
    p.is_active !== false && (!gender || (p.gender ?? 'masculino') === gender)
  )
  return (
    <select value={current ?? ''} onChange={(e) => onSelect(e.target.value)}
      className="w-full rounded-lg px-3 py-2 text-sm">
      <option value="">— Manual / no en plantel —</option>
      {filteredPlayers.map((p) => (
        <option key={p.id} value={p.id}>
          {p.shirt_number ? `#${p.shirt_number} ` : ''}{p.display_name}
        </option>
      ))}
    </select>
  )
}

export default function ManageScorers() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const ligaParam = params.get('liga') ?? ''
  const faseParam = params.get('fase') ?? ''

  const [ligaId, setLigaId] = useState(ligaParam)
  const [faseId, setFaseId] = useState(faseParam)

  const { data: ligas = [] } = useLeagues()
  const { data: fases = [] } = usePhases(ligaId)
  const { data: equipos = [] } = useLeagueTeams(ligaId)
  const { data: scorers = [], isLoading } = useManualScorers(faseId)

  const upsert = useUpsertManualScorer()
  const remove = useDeleteManualScorer()

  // Auto seleccion
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

  // Form de nuevo goleador
  const [form, setForm] = useState({
    team_id: '',
    player_id: '',
    player_name: '',
    base_goals: '',
  })
  const [error, setError] = useState(null)
  const [okFlash, setOkFlash] = useState(false)

  // Edit inline de goles existentes
  const [edits, setEdits] = useState({}) // { id: nuevoNumero }

  // Filtro: equipos disponibles para el equipo elegido en el form
  const playersFromTeam = useTeamPlayers(form.team_id)

  function setFormField(k, v) {
    setForm((prev) => {
      const next = { ...prev, [k]: v }
      // Si elige un player_id, autofill player_name desde el plantel
      if (k === 'player_id' && v) {
        const list = playersFromTeam.data ?? []
        const player = list.find((p) => p.id === v)
        if (player) next.player_name = player.display_name
      }
      // Si cambia team_id, resetear player
      if (k === 'team_id') {
        next.player_id = ''
        next.player_name = ''
      }
      return next
    })
  }

  async function agregar() {
    setError(null)
    try {
      if (!faseId) throw new Error('Elegí una fase')
      if (!form.team_id) throw new Error('Elegí un equipo')
      if (!form.player_name?.trim()) throw new Error('Falta nombre del jugador')
      const goals = form.base_goals === '' ? 0 : parseInt(form.base_goals, 10)
      if (Number.isNaN(goals) || goals < 0) throw new Error('Cantidad de goles inválida')
      await upsert.mutateAsync({
        phase_id: faseId,
        team_id: form.team_id,
        player_id: form.player_id || null,
        player_name: form.player_name.trim(),
        base_goals: goals,
      })
      setForm({ team_id: form.team_id, player_id: '', player_name: '', base_goals: '' })
      setOkFlash(true); setTimeout(() => setOkFlash(false), 2500)
    } catch (err) {
      setError(err?.message ?? 'No se pudo guardar')
    }
  }

  async function actualizarGoles(s) {
    const nuevoVal = edits[s.id]
    if (nuevoVal === undefined) return
    setError(null)
    try {
      await upsert.mutateAsync({
        id: s.id,
        phase_id: s.phase_id,
        team_id: s.team_id,
        player_id: s.player_id,
        player_name: s.player_name,
        base_goals: parseInt(nuevoVal, 10) || 0,
      })
      setEdits((prev) => { const c = { ...prev }; delete c[s.id]; return c })
      setOkFlash(true); setTimeout(() => setOkFlash(false), 2500)
    } catch (err) {
      setError(err?.message ?? 'No se pudo actualizar')
    }
  }

  async function eliminar(s) {
    if (!window.confirm(`¿Borrar a ${s.player_name}?`)) return
    setError(null)
    try {
      await remove.mutateAsync({ id: s.id })
    } catch (err) {
      setError(err?.message ?? 'No se pudo borrar')
    }
  }

  return (
    <div className="px-3 py-5 pb-28 space-y-4">
      <div>
        <button onClick={() => navigate('/admin/ligas')}
          className="text-primary text-sm font-medium hover:underline">← Ligas</button>
      </div>

      <div>
        <h1 className="text-xl font-extrabold text-zinc-100">Goleadores</h1>
        <p className="text-xs text-zinc-500 mt-1">
          Cargá los goles <strong>históricos</strong> (pre-app) por jugador. Los goles de partidos
          cargados en el sistema se suman automáticamente con estos números.
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

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs rounded-xl px-3 py-2">
          ⚠ {error}
        </div>
      )}
      {okFlash && (
        <div className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl px-3 py-2">
          ✓ Goleador guardado
        </div>
      )}

      {/* Form alta */}
      {faseId && (
        <div className="bg-surface-900 border border-surface-800 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Agregar goleador</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select value={form.team_id} onChange={(e) => setFormField('team_id', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm">
              <option value="">Equipo...</option>
              {equipos.map((e) => (
                <option key={e.id} value={e.team_id}>{e.team_short_name ?? e.team_name}</option>
              ))}
            </select>
            <input type="number" min="0" placeholder="Goles base"
              value={form.base_goals}
              onChange={(e) => setFormField('base_goals', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm" />
          </div>

          {form.team_id && (
            <PlayerOptions
              teamId={form.team_id}
              current={form.player_id}
              gender={liga?.gender}
              onSelect={(v) => setFormField('player_id', v)}
            />
          )}

          <input type="text" placeholder="Nombre del jugador (manual o autocompletado del plantel)"
            value={form.player_name}
            onChange={(e) => setFormField('player_name', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm" />

          <Button onClick={agregar} disabled={upsert.isPending} className="w-full">
            {upsert.isPending ? '...' : '+ Agregar goleador'}
          </Button>
        </div>
      )}

      {/* Lista de goleadores cargados */}
      {faseId && (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
              Goleadores cargados · {scorers.length}
            </p>
          </div>
          {isLoading && <Spinner className="py-12" />}
          {!isLoading && scorers.length === 0 && (
            <p className="text-center text-zinc-500 text-sm py-10">
              No hay goleadores cargados en esta fase.
            </p>
          )}
          {scorers.length > 0 && (
            <div className="bg-surface-900 rounded-xl border border-surface-800 divide-y divide-surface-800">
              {scorers.map((s, i) => {
                const editVal = edits[s.id]
                const isDirty = editVal !== undefined && Number(editVal) !== s.base_goals
                return (
                  <div key={s.id} className="px-3 py-2 flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-5 font-bold">{i + 1}</span>
                    <TeamLogo
                      logoUrl={s.teams?.logo_url}
                      name={s.teams?.name}
                      color={s.teams?.primary_color}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-100 truncate font-medium">{s.player_name}</p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {s.teams?.short_name ?? s.teams?.name}
                        {s.player_id && ' · plantel'}
                      </p>
                    </div>
                    <input type="number" min="0"
                      value={editVal !== undefined ? editVal : s.base_goals}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      className="w-14 rounded px-2 py-1 text-xs text-center bg-surface-800 border border-surface-700 focus:outline-none focus:border-primary" />
                    {isDirty ? (
                      <Button size="sm" onClick={() => actualizarGoles(s)}>OK</Button>
                    ) : (
                      <button onClick={() => eliminar(s)}
                        className="text-xs text-red-400 hover:text-red-300 px-2">
                        Borrar
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {liga && (
        <p className="text-[11px] text-zinc-500 px-1">
          {liga.sports?.icon} {liga.name}{liga.season ? ` · ${liga.season}` : ''}
        </p>
      )}
    </div>
  )
}
