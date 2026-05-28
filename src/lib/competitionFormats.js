export const KNOCKOUT_PHASES = [
  { name: '64avos de final', shortLabel: '64avos' },
  { name: '32avos de final', shortLabel: '32avos' },
  { name: '16avos de final', shortLabel: '16avos' },
  { name: 'Octavos de final', shortLabel: '8avos' },
  { name: 'Cuartos de final', shortLabel: '4tos' },
  { name: 'Semifinal', shortLabel: 'Semi' },
  { name: 'Final', shortLabel: 'Final' },
]

export const KNOCKOUT_PHASE_NAMES = KNOCKOUT_PHASES.map((phase) => phase.name)

export function getNextKnockoutPhaseName(existingPhases = []) {
  const existingNames = new Set(existingPhases.map((phase) => phase.name))
  const firstExistingIndex = KNOCKOUT_PHASE_NAMES.findIndex((name) => existingNames.has(name))
  const searchFrom = firstExistingIndex >= 0 ? firstExistingIndex + 1 : 0
  return KNOCKOUT_PHASE_NAMES.slice(searchFrom).find((name) => !existingNames.has(name)) ?? 'Nueva fase'
}
