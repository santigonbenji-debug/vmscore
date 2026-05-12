import chromium from '@sparticuz/chromium'
import { chromium as playwrightChromium } from 'playwright-core'

export const config = {
  maxDuration: 60,
}

function normalizeSourceUrl(value) {
  const raw = String(value ?? '').trim()
  if (!/^https:\/\/copafacil\.com\/[^@/?#]+@[^/?#]+/i.test(raw)) {
    throw new Error('El link de Copa Facil no es valido.')
  }
  return raw.replace(/\/+$/, '')
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function summarizeNetwork(entries) {
  const urls = entries.map((entry) => entry.url)
  return {
    total: entries.length,
    firebase_urls: unique(urls.filter((url) => url.includes('firebaseio.com'))).slice(0, 80),
    api_urls: unique(urls.filter((url) => url.includes('/api2/'))).slice(0, 80),
    storage_images: unique(urls.filter((url) => url.includes('firebasestorage.googleapis.com') || url.match(/\.(png|jpe?g|webp|svg)(\?|$)/i))).slice(0, 120),
    failed: entries.filter((entry) => entry.status >= 400).slice(0, 40),
  }
}

async function launchBrowser() {
  return playwrightChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })
}

async function captureRoute(page, route) {
  await page.goto(route.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null)
  await page.waitForTimeout(3500)

  const pageInfo = await page.evaluate(() => {
    const meta = (name) =>
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
      null

    return {
      title: document.title,
      body_text: document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 1200) ?? '',
      canvas_count: document.querySelectorAll('canvas').length,
      image_sources: [...document.images].map((image) => image.currentSrc || image.src).filter(Boolean).slice(0, 80),
      og_title: meta('og:title'),
      og_image: meta('og:image'),
      og_description: meta('og:description'),
    }
  })

  const screenshot = await page.screenshot({
    type: 'jpeg',
    quality: 45,
    fullPage: false,
  })

  return {
    ...route,
    ...pageInfo,
    screenshot_data_url: `data:image/jpeg;base64,${screenshot.toString('base64')}`,
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  let browser
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body
    const sourceUrl = normalizeSourceUrl(body?.sourceUrl)
    const routesToVisit = [
      { key: 'home', label: 'Inicio', url: sourceUrl },
      { key: 'classification', label: 'Clasificacion', url: `${sourceUrl}/classification` },
      { key: 'rankings', label: 'Rankings', url: `${sourceUrl}/rankings` },
    ]

    browser = await launchBrowser()
    const page = await browser.newPage({
      viewport: { width: 1366, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36 VMScoreBot/1.0',
    })

    const network = []
    page.on('response', (res) => {
      const url = res.url()
      if (
        url.includes('copafacil') ||
        url.includes('firebase') ||
        url.includes('googleapis') ||
        url.includes('b-cdn.net')
      ) {
        network.push({
          status: res.status(),
          url,
          content_type: res.headers()['content-type'] ?? '',
        })
      }
    })

    const routes = []
    for (const route of routesToVisit) {
      try {
        routes.push(await captureRoute(page, route))
      } catch (error) {
        routes.push({
          ...route,
          error: error?.message ?? 'No se pudo capturar la ruta.',
        })
      }
    }

    const networkSummary = summarizeNetwork(network)
    const visual = {
      ran_at: new Date().toISOString(),
      source_url: sourceUrl,
      routes,
      network: networkSummary,
      findings: [
        'La web de Copa Facil renderiza gran parte del contenido en Flutter/canvas.',
        'El worker visual ya puede abrir el torneo, capturar pantallas y descubrir llamadas de red.',
        'Si goleadores/eventos no aparecen como JSON, el siguiente paso es OCR/click dirigido sobre las pantallas capturadas.',
      ],
      capabilities: {
        browser_render: true,
        screenshots: routes.some((route) => route.screenshot_data_url),
        network_discovery: true,
        dom_text: routes.some((route) => route.body_text),
        canvas_detected: routes.some((route) => route.canvas_count > 0),
      },
    }

    return response.status(200).json({ visual })
  } catch (error) {
    return response.status(400).json({ error: error?.message ?? 'No se pudo ejecutar el scraping visual.' })
  } finally {
    if (browser) {
      await browser.close().catch(() => null)
    }
  }
}
