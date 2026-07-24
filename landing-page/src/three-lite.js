/**
 * Explicit re-export of the only three.js surface the scene touches.
 *
 * `import('three')` pulls a namespace object the bundler can't tree-shake, which
 * costs ~180 kB gzipped. Re-exporting names lets Rollup drop everything else.
 * Add to this list when the scene needs a new class — nothing else imports three.
 */
export {
  AdditiveBlending,
  CanvasTexture,
  CatmullRomCurve3,
  Clock,
  EdgesGeometry,
  Fog,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Scene,
  Sphere,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
