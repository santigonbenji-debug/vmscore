import { deepScrapeCopaFacil } from '../src/lib/copaFacilDeepScrape.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body
    const sourceUrl = body?.sourceUrl
    const snapshot = await deepScrapeCopaFacil(sourceUrl)
    return response.status(200).json(snapshot)
  } catch (error) {
    return response.status(400).json({
      error: error?.message ?? 'No se pudo analizar Copa Facil.',
    })
  }
}
