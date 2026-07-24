import { useEffect, useRef } from 'react'

/**
 * The background world: a 3D agent graph the page scroll flies through.
 *
 * Scroll position drives a camera along a fixed spline — the page never moves
 * the scene, it moves the camera — so the whole document reads as one
 * continuous flight through the same graph the desktop app draws on its canvas.
 *
 * three.js is imported dynamically so it never blocks first paint, and the
 * caller is expected to skip mounting this entirely under reduced motion.
 */

const ACCENT = 0x4fd6c9
const DIM = 0x49525f
const BG = 0x0a0b0d

const CLUSTERS = 7 // one "workspace" per stop along the flight
const CLUSTER_DEPTH = 18 // world units between stops

// The spline carries a padding point on each end so its tangents stay smooth.
// Scroll only drives the inner stretch, otherwise the flight starts and ends
// staring into empty fog instead of at the first and last cluster.
const FLIGHT_START = 0.06
const FLIGHT_END = 0.89

// Deterministic layout: the graph must look identical on every load, otherwise
// the composition behind the hero copy is a lottery.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pathPoint(THREE, i) {
  return new THREE.Vector3(Math.sin(i * 0.85) * 3.4, Math.cos(i * 0.62) * 1.9, 10 - i * CLUSTER_DEPTH)
}

function haloTexture(THREE) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.18)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

export default function GraphScene({ reduced = false }) {
  const hostRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let teardown = () => {}

    import('./three-lite.js')
      .then((THREE) => {
        if (disposed) return

        const compact = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches
        const nodesPerCluster = compact ? 3 : 4

        let renderer
        try {
          renderer = new THREE.WebGLRenderer({ antialias: !compact, alpha: true, powerPreference: 'high-performance' })
        } catch {
          return // no WebGL — the page still works, the scene is decoration
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.25 : 1.75))
        renderer.setSize(window.innerWidth, window.innerHeight)
        host.appendChild(renderer.domElement)

        const scene = new THREE.Scene()
        scene.fog = new THREE.Fog(BG, 7, 46)

        const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200)

        const curvePoints = []
        for (let i = -1; i <= CLUSTERS + 1; i += 1) curvePoints.push(pathPoint(THREE, i))
        const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.5)

        // --- shared resources (disposed together at the end) ----------------
        const cardGeo = new THREE.PlaneGeometry(1.7, 0.95)
        const borderGeo = new THREE.EdgesGeometry(cardGeo)
        const rowGeo = new THREE.PlaneGeometry(0.8, 0.055)
        const dotGeo = new THREE.PlaneGeometry(0.11, 0.11)
        const pulseGeo = new THREE.SphereGeometry(0.06, 8, 8)
        const halo = haloTexture(THREE)

        const cardMat = new THREE.MeshBasicMaterial({ color: 0x12161d, transparent: true, opacity: 0.88, fog: true })
        const rowMat = new THREE.MeshBasicMaterial({ color: 0x4a5462, transparent: true, opacity: 0.9, fog: true })
        const borderDim = new THREE.LineBasicMaterial({ color: DIM, fog: true })
        const borderAccent = new THREE.LineBasicMaterial({ color: ACCENT, fog: true })
        const dotMat = new THREE.MeshBasicMaterial({ color: ACCENT, fog: true })
        const wireMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.5, fog: true })
        const pulseMat = new THREE.MeshBasicMaterial({
          color: ACCENT,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: true,
        })
        const haloMat = new THREE.SpriteMaterial({
          map: halo,
          color: ACCENT,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: true,
        })

        const shared = [cardGeo, borderGeo, rowGeo, dotGeo, pulseGeo, halo, cardMat, rowMat, borderDim, borderAccent, dotMat, wireMat, pulseMat, haloMat]

        // --- nodes -----------------------------------------------------------
        const rand = rng(0xa17a1)
        const nodes = []

        for (let c = 0; c < CLUSTERS; c += 1) {
          const center = pathPoint(THREE, c + 0.5)
          for (let n = 0; n < nodesPerCluster; n += 1) {
            const angle = (n / nodesPerCluster) * Math.PI * 2 + c * 0.7
            const radius = 3.4 + rand() * 3.2
            const group = new THREE.Group()
            group.position.set(
              center.x + Math.cos(angle) * radius,
              center.y + Math.sin(angle) * radius * 0.62,
              center.z + (rand() - 0.5) * 7,
            )

            const accent = (c + n) % 3 === 0
            group.add(new THREE.Mesh(cardGeo, cardMat))
            group.add(new THREE.LineSegments(borderGeo, accent ? borderAccent : borderDim))

            const dot = new THREE.Mesh(dotGeo, dotMat)
            dot.position.set(-0.66, 0.26, 0.01)
            group.add(dot)

            const row = new THREE.Mesh(rowGeo, rowMat)
            row.position.set(-0.05, -0.06, 0.01)
            group.add(row)

            if (accent) {
              const sprite = new THREE.Sprite(haloMat)
              sprite.scale.setScalar(4.2)
              sprite.position.z = -0.05
              group.add(sprite)
            }

            scene.add(group)
            nodes.push({ group, baseY: group.position.y, phase: rand() * Math.PI * 2, cluster: c })
          }
        }

        // --- edges (the ACL made visible) ------------------------------------
        const edges = []
        const link = (a, b) => {
          const mid = a.group.position.clone().lerp(b.group.position, 0.5)
          mid.x += (rand() - 0.5) * 2.4
          mid.y += (rand() - 0.5) * 1.6
          const wire = new THREE.QuadraticBezierCurve3(a.group.position.clone(), mid, b.group.position.clone())
          const tube = new THREE.Mesh(new THREE.TubeGeometry(wire, 22, 0.014, 4, false), wireMat)
          scene.add(tube)

          const pulse = new THREE.Mesh(pulseGeo, pulseMat)
          pulse.visible = !reduced
          scene.add(pulse)
          edges.push({ wire, tube, pulse, speed: 0.14 + rand() * 0.22, offset: rand() })
        }

        for (let c = 0; c < CLUSTERS; c += 1) {
          const inCluster = nodes.filter((node) => node.cluster === c)
          inCluster.forEach((node, i) => link(node, inCluster[(i + 1) % inCluster.length]))
          const next = nodes.find((node) => node.cluster === c + 1)
          if (next) link(inCluster[0], next)
        }

        // --- scroll → camera --------------------------------------------------
        let scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
        let smoothed = 0
        const pointer = { x: 0, y: 0 }
        const offset = new THREE.Vector3()
        const basePos = new THREE.Vector3()
        const tangent = new THREE.Vector3()
        const lookAt = new THREE.Vector3()

        const onPointerMove = (e) => {
          pointer.x = (e.clientX / window.innerWidth - 0.5) * 2
          pointer.y = (e.clientY / window.innerHeight - 0.5) * 2
        }

        let lastWidth = window.innerWidth
        const onResize = () => {
          // Mobile browsers fire resize when the URL bar hides — width-only guard.
          if (window.innerWidth === lastWidth && compact) return
          lastWidth = window.innerWidth
          camera.aspect = window.innerWidth / window.innerHeight
          camera.updateProjectionMatrix()
          renderer.setSize(window.innerWidth, window.innerHeight)
        }

        const bodyObserver = new ResizeObserver(() => {
          scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
        })
        bodyObserver.observe(document.body)

        window.addEventListener('resize', onResize)
        if (!compact && !reduced) window.addEventListener('pointermove', onPointerMove, { passive: true })

        const clock = new THREE.Clock()

        renderer.setAnimationLoop(() => {
          const t = clock.getElapsedTime()
          const target = Math.min(1, Math.max(0, window.scrollY / scrollable))
          smoothed += (target - smoothed) * 0.075

          const u = FLIGHT_START + smoothed * (FLIGHT_END - FLIGHT_START)
          curve.getPointAt(u, basePos)
          curve.getTangentAt(u, tangent)
          offset.set(pointer.x * 1.1, -pointer.y * 0.7, 0)

          lookAt.copy(basePos).add(tangent).add(offset)
          camera.position.copy(basePos).add(offset)
          camera.lookAt(lookAt)

          for (const node of nodes) {
            // Scroll drives the camera; idle bob is autonomous motion — off under reduced-motion.
            node.group.position.y = node.baseY + (reduced ? 0 : Math.sin(t * 0.5 + node.phase) * 0.13)
            node.group.quaternion.copy(camera.quaternion)
          }

          if (!reduced) {
            for (const edge of edges) {
              edge.wire.getPointAt((edge.offset + t * edge.speed) % 1, edge.pulse.position)
            }
          }

          renderer.render(scene, camera)
        })

        requestAnimationFrame(() => host.classList.add('is-ready'))

        teardown = () => {
          renderer.setAnimationLoop(null)
          window.removeEventListener('resize', onResize)
          window.removeEventListener('pointermove', onPointerMove)
          bodyObserver.disconnect()
          edges.forEach((edge) => edge.tube.geometry.dispose())
          shared.forEach((resource) => resource.dispose())
          renderer.dispose()
          renderer.domElement.remove()
        }
      })
      .catch(() => {
        /* three failed to load — the page is fully usable without it */
      })

    return () => {
      disposed = true
      teardown()
    }
  }, [])

  return <div ref={hostRef} className="scene" aria-hidden="true" />
}
