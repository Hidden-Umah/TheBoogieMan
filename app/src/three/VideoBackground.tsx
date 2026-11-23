import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { hud } from '../hud/store'

/**
 * A video playing behind everything, seen through a heavy blur layer.
 * The blur is cheap and works everywhere: each frame is drawn into a tiny canvas
 * and stretched back up with smooth filtering. Stars, core and screens sit on top.
 *
 * Drop your own clip in app/public/bg/ as custom.mp4 or custom.webm to replace
 * the default (an original loop made by tools/gen_background.py). Ctrl+B toggles it.
 */
const SOURCES = ['/bg/custom.webm', '/bg/custom.mp4', '/bg/background.webm']
const BW = 128
const BH = 72

export default function VideoBackground({ devil }: { devil: React.RefObject<number> }) {
  const { scene } = useThree()
  const fade = useRef(0)
  const { video, ctx, tex } = useMemo(() => {
    const video = document.createElement('video')
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    const canvas = document.createElement('canvas')
    canvas.width = BW
    canvas.height = BH
    const ctx = canvas.getContext('2d', { willReadFrequently: false })!
    const tex = new THREE.CanvasTexture(canvas)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.colorSpace = THREE.NoColorSpace // the scene renders linear-in/linear-out
    return { video, ctx, tex }
  }, [])

  useEffect(() => {
    let i = 0
    const tryNext = () => {
      if (i >= SOURCES.length) return
      video.src = SOURCES[i++]
      video.play().catch(() => {})
    }
    video.addEventListener('error', tryNext)
    tryNext()
    return () => {
      video.removeEventListener('error', tryNext)
      video.pause()
      video.removeAttribute('src')
      video.load()
      tex.dispose()
      scene.background = null
    }
  }, [video, tex, scene])

  useFrame((_, dt) => {
    const ready = video.readyState >= 2
    const target = hud.bg && ready ? 1 : 0
    fade.current += (target - fade.current) * (1 - Math.exp(-dt * 2))
    if (fade.current < 0.01) {
      if (scene.background === tex) scene.background = null
      if (!hud.bg && !video.paused) video.pause()
      return
    }
    if (hud.bg && video.paused) video.play().catch(() => {})
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, BW, BH)
    ctx.globalAlpha = 0.9 * fade.current
    if (ready) ctx.drawImage(video, 0, 0, BW, BH)
    // Devil mode: multiply toward red.
    const d = devil.current ?? 0
    if (d > 0.01) {
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'multiply'
      const gb = Math.round(255 - 215 * d)
      ctx.fillStyle = `rgb(255,${gb},${gb})`
      ctx.fillRect(0, 0, BW, BH)
    }
    tex.needsUpdate = true
    scene.background = tex
  })

  return null
}
