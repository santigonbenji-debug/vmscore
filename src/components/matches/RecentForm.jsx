import TeamLogo from '../teams/TeamLogo'

const RESULT_STYLES = {
  G: 'bg-emerald-500 text-emerald-950',
  E: 'bg-zinc-500 text-white',
  P: 'bg-red-500 text-white',
  '?': 'bg-surface-700 text-zinc-400',
}

function resultForTeam(match, teamId) {
  if (match.status !== 'finished') return null
  if (match.home_score == null || match.away_score == null) return null

  const ownScore = match.home_team_id === teamId ? match.home_score : match.away_score
  const rivalScore = match.home_team_id === teamId ? match.away_score : match.home_score
  if (ownScore === rivalScore) return 'E'
  return ownScore > rivalScore ? 'G' : 'P'
}

function resultLabel(result) {
  if (result === 'G') return 'Ganado'
  if (result === 'E') return 'Empatado'
  if (result === 'P') return 'Perdido'
  return 'Sin partido'
}

export default function RecentForm({ team, matches = [], currentMatchId, limit = 5 }) {
  const recent = matches
    .filter((match) => match.id !== currentMatchId)
    .map((match) => resultForTeam(match, team.id))
    .filter(Boolean)
    .slice(0, limit)
  const results = [...recent, ...Array(Math.max(0, limit - recent.length)).fill('?')]

  return (
    <div className="flex items-center gap-3">
      <TeamLogo logoUrl={team.logoUrl} name={team.name} color={team.color} size="sm" />
      <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-200">{team.name}</span>
      <div className="flex w-40 max-w-[46%] overflow-hidden rounded-full border border-surface-700">
        {results.map((result, index) => (
          <span
            key={`${result}-${index}`}
            title={resultLabel(result)}
            className={`grid h-7 min-w-0 flex-1 place-items-center border-r border-surface-950/60 text-[10px] font-black last:border-r-0 ${RESULT_STYLES[result]}`}
          >
            {result}
          </span>
        ))}
      </div>
    </div>
  )
}
