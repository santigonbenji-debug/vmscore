function cleanText(value) {
  return String(value ?? '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeNumber(value, fallback = null) {
  const normalized = String(value ?? '')
    .replace(/[oO]/g, '0')
    .replace(/[iIl]/g, '1')
    .replace(/[sS]/g, '5')
    .replace(/[bB]/g, '8')
    .replace(/[^0-9]/g, '')
  if (!normalized) return fallback
  const number = Number(normalized)
  return Number.isFinite(number) ? number : fallback
}

function parseScorers(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)

  const scorers = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line.match(/^([0-9A-Za-z"'&]{1,3})\s+(.+?)\s+([0-9A-Za-z]{1,3})$/)
    if (!match) continue

    const sourceOrder = scorers.length + 1
    let position = normalizeNumber(match[1], sourceOrder)
    if (position > sourceOrder + 20) position = sourceOrder
    const playerName = match[2]
      .replace(/\b(PLAYERS?|GOALS?|TOTAL|Scorers?)\b/gi, '')
      .replace(/[^\p{L}\p{N}\s,.'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const goals = normalizeNumber(match[3])

    if (!playerName || !Number.isFinite(position) || !Number.isFinite(goals)) continue
    if (playerName.length < 4) continue
    if (!/[,\s]/.test(playerName)) continue

    const nextLine = lines[index + 1] ?? ''
    const teamName = nextLine && !/^[0-9A-Za-z"'&]{1,3}\s+/.test(nextLine) ? nextLine : ''

    scorers.push({
      position,
      player_name: playerName,
      team_name: teamName,
      goals,
      source_order: sourceOrder,
      source_line: line,
    })
  }

  const seen = new Set()
  return scorers.filter((scorer) => {
    const key = `${scorer.player_name.toLowerCase()}|${scorer.goals}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function recognizeRankings(worker, image) {
  const result = await worker.recognize(image, {
    rectangle: {
      left: 38,
      top: 205,
      width: 720,
      height: 520,
    },
  })
  const text = result?.data?.text ?? ''
  return {
    text,
    scorers: parseScorers(text),
    mode: 'rankings-card',
  }
}

export async function extractRankingsOcr(captures) {
  const images = (Array.isArray(captures) ? captures : [])
    .map((capture) => ({
      label: capture?.label ?? 'captura',
      image: String(capture?.screenshot_data_url ?? '').startsWith('data:image/')
        ? capture.screenshot_data_url
        : null,
    }))
    .filter((capture) => capture.image)
    .slice(0, 1)

  if (images.length === 0) {
    throw new Error('No hay capturas validas para OCR.')
  }

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: () => {},
  })

  try {
    const pages = []
    const mergedScorers = []

    for (const capture of images) {
      const { text, scorers, mode } = await recognizeRankings(worker, capture.image)
      pages.push({
        label: capture.label,
        mode,
        text,
        scorers,
      })
      mergedScorers.push(...scorers)
    }

    const seen = new Set()
    const scorers = mergedScorers
      .filter((scorer) => {
        const key = `${scorer.player_name.toLowerCase()}|${scorer.goals}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => b.goals - a.goals || a.source_order - b.source_order)

    return {
      ran_at: new Date().toISOString(),
      kind: 'rankings',
      pages,
      scorers,
      counts: {
        captures: images.length,
        scorers: scorers.length,
      },
    }
  } finally {
    await worker.terminate().catch(() => null)
  }
}
