import { Sparkles, Trophy } from 'lucide-react'
import TeamLogo from '../teams/TeamLogo'

function normalizeTeam(team) {
  if (!team) return null
  return {
    name: team.name ?? team.team_name ?? 'Equipo campeon',
    logoUrl: team.logo_url ?? team.team_logo_url,
    color: team.primary_color ?? '#E84E1B',
  }
}

export default function ChampionCelebration({ team, leagueName, compact = false }) {
  const champion = normalizeTeam(team)
  if (!champion) return null

  return (
    <section className={`champion-card relative overflow-hidden border border-amber-400/35 bg-[#18130b] ${compact ? 'rounded-xl px-3 py-3' : 'rounded-2xl px-4 py-4'}`}>
      <div className="champion-shine pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-white/10" />
      <div className="relative flex items-center gap-3">
        <div className="relative">
          <TeamLogo
            logoUrl={champion.logoUrl}
            name={champion.name}
            color={champion.color}
            size={compact ? 'md' : 'lg'}
            className="border-amber-300/70"
          />
          <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-amber-950 shadow-lg">
            <Trophy className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
            <Sparkles className="h-3 w-3" /> Campeon
          </p>
          <h2 className={`${compact ? 'text-sm' : 'text-lg'} truncate font-black text-amber-50`}>{champion.name}</h2>
          {leagueName && <p className="truncate text-xs text-amber-200/65">{leagueName}</p>}
        </div>
        <Trophy className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} champion-trophy shrink-0 text-amber-400/80`} />
      </div>
    </section>
  )
}
