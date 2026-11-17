import { createContext, useEffect, useState } from 'react'
import type { BattleElement } from './war-arts.ts'

type Graphics = {
  portraits: Partial<Record<string, string>>
  portraitImages: Partial<Record<string, HTMLImageElement>>
  units: Partial<Record<string, HTMLImageElement>>
  attack: Partial<Record<string, HTMLImageElement>>
  special: Partial<Record<string, HTMLImageElement>>
  effects: Partial<Record<BattleElement, HTMLImageElement>>
  officerSprites: Partial<Record<string, string>>
}

const assetRoot = '/jo-assets/'
export const LocalGraphicsContext = createContext<Graphics | null>(null)

async function loadLocalGraphics(): Promise<Graphics | null> {
  const response = await fetch(assetRoot + 'manifest.json')
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
  const { portraits, units, attack = {}, special = {}, effects = {}, officerSprites = {} } = await response.json() as {
    portraits: Record<string, string>
    units: Record<string, string>
    attack?: Record<string, string>
    special?: Record<string, string>
    effects?: Partial<Record<BattleElement, string>>
    officerSprites?: Record<string, string>
  }
  async function loadImages(files: Record<string, string>): Promise<Graphics['units']> {
    const images: Graphics['units'] = {}
    await Promise.all(Object.entries(files).map(async ([key, url]) => {
      const image = new Image()
      image.src = assetRoot + url
      try {
        await image.decode()
        images[key] = image
      } catch {
        // A missing local frame leaves the normal battle marker available.
      }
    }))
    return images
  }
  const [unitImages, attackImages, specialImages, portraitImages, effectImages] = await Promise.all([
    loadImages(units), loadImages(attack), loadImages(special), loadImages(portraits), loadImages(effects),
  ])
  return {
    portraits: Object.fromEntries(Object.entries(portraits).map(([name, url]) => [name, assetRoot + url])),
    portraitImages,
    units: unitImages,
    attack: attackImages,
    special: specialImages,
    effects: effectImages,
    officerSprites,
  }
}

export function useLocalGraphics() {
  const [graphics, setGraphics] = useState<Graphics | null>(null)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    let mounted = true
    void loadLocalGraphics().then((value) => {
      if (mounted) setGraphics(value)
    }).catch(() => {})
    return () => { mounted = false }
  }, [])
  return graphics
}
