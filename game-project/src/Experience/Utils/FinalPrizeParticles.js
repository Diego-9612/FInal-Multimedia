// FinalPrizeParticles.js (efectos de portal con vórtices, aro pulsante, haz y anillos ascendentes)
import * as THREE from 'three'

export default class FinalPrizeParticles {
  /**
   * @param {Object} opts
   * @param {THREE.Scene} opts.scene
   * @param {THREE.Vector3} opts.targetPosition  // centro del portal
   * @param {THREE.Vector3} [opts.sourcePosition] // opcional, punto desde donde "nacen" partículas
   * @param {any} opts.experience
   */
  constructor({ scene, targetPosition, sourcePosition, experience }) {
    this.scene = scene
    this.experience = experience
    this.clock = new THREE.Clock()
    this.group = new THREE.Group()
    this.scene.add(this.group)

    // ---------- Parámetros ----------
    this.countOuter = 120    // partículas vórtice externo
    this.countInner = 70     // partículas vórtice interno
    this.portalRadius = 1.6  // radio base del portal
    this.vortexHeight = 2.6  // altura del vórtice
    this.spinSpeedOuter = 1.2
    this.spinSpeedInner = 1.8
    this.inwardDamp = 0.985
    this.riseSpeed = 0.35
    this.ringSpawnEvery = 0.22  // seg
    this.maxRings = 8

    this.target = targetPosition.clone()
    this.source = (sourcePosition ? sourcePosition.clone() : this.target.clone())
    this.rings = []
    this.elapsedSinceRing = 0

    // Agrupar todo en el centro del portal
    this.group.position.copy(this.target)

    // ---------- Vórtice externo (Points) ----------
    {
      this.anglesOuter = new Float32Array(this.countOuter)
      this.radiiOuter  = new Float32Array(this.countOuter)
      this.heightsOuter= new Float32Array(this.countOuter)
      const positions = new Float32Array(this.countOuter * 3)

      for (let i = 0; i < this.countOuter; i++) {
        const i3 = i * 3
        const ang = Math.random() * Math.PI * 2
        const rad = this.portalRadius + Math.random() * 2.2
        const y   = (Math.random() * this.vortexHeight) - this.vortexHeight * 0.35

        this.anglesOuter[i]  = ang
        this.radiiOuter[i]   = rad
        this.heightsOuter[i] = y

        positions[i3 + 0] = Math.cos(ang) * rad
        positions[i3 + 1] = y
        positions[i3 + 2] = Math.sin(ang) * rad
      }

      this.geomOuter = new THREE.BufferGeometry()
      this.geomOuter.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      this.matOuter = new THREE.PointsMaterial({
        size: 0.20,
        color: 0x9a6bff,      // lila
        transparent: true,
        opacity: 0.95,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })

      this.pointsOuter = new THREE.Points(this.geomOuter, this.matOuter)
      this.group.add(this.pointsOuter)
    }

    // ---------- Vórtice interno (Points) ----------
    {
      this.anglesInner = new Float32Array(this.countInner)
      this.radiiInner  = new Float32Array(this.countInner)
      this.heightsInner= new Float32Array(this.countInner)
      const positions = new Float32Array(this.countInner * 3)

      for (let i = 0; i < this.countInner; i++) {
        const i3 = i * 3
        const ang = Math.random() * Math.PI * 2
        const rad = 0.4 + Math.random() * (this.portalRadius * 0.9)
        const y   = (Math.random() * this.vortexHeight * 0.6) - this.vortexHeight * 0.25

        this.anglesInner[i]  = ang
        this.radiiInner[i]   = rad
        this.heightsInner[i] = y

        positions[i3 + 0] = Math.cos(ang) * rad
        positions[i3 + 1] = y
        positions[i3 + 2] = Math.sin(ang) * rad
      }

      this.geomInner = new THREE.BufferGeometry()
      this.geomInner.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      this.matInner = new THREE.PointsMaterial({
        size: 0.16,
        color: 0x00e5ff,      // cian
        transparent: true,
        opacity: 0.95,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })

      this.pointsInner = new THREE.Points(this.geomInner, this.matInner)
      this.group.add(this.pointsInner)
    }

    // ---------- Aro pulsante (Torus) ----------
    {
      this.torusGeom = new THREE.TorusGeometry(this.portalRadius * 0.92, 0.08, 16, 64)
      this.torusMat  = new THREE.MeshBasicMaterial({
        color: 0xaa00ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
      this.torus = new THREE.Mesh(this.torusGeom, this.torusMat)
      this.torus.rotation.x = -Math.PI / 2
      this.group.add(this.torus)
    }

    // ---------- Haz vertical (Cylinder) ----------
    {
      const radiusTop = 0.3
      const radiusBottom = 0.3
      const height = this.vortexHeight * 1.4
      this.beamGeom = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16, 1, true)
      this.beamMat = new THREE.MeshBasicMaterial({
        color: 0x7f00ff,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      })
      this.beam = new THREE.Mesh(this.beamGeom, this.beamMat)
      this.beam.position.y = height * 0.5 - 0.2
      this.group.add(this.beam)
    }

    // ---------- Disco de brillo en el suelo (Ring) ----------
    {
      this.glowGeom = new THREE.RingGeometry(this.portalRadius * 0.65, this.portalRadius * 1.25, 48, 1)
      this.glowMat  = new THREE.MeshBasicMaterial({
        color: 0xb388ff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
      this.glow = new THREE.Mesh(this.glowGeom, this.glowMat)
      this.glow.rotation.x = -Math.PI / 2
      this.group.add(this.glow)
    }

    // ---------- Trayectoria de partículas desde source → target (opcional) ----------
    if (sourcePosition) {
      const travelCount = 60
      const positions = new Float32Array(travelCount * 3)
      const alphas    = new Float32Array(travelCount)
      const speeds    = new Float32Array(travelCount)
      this.travelData = { positions, alphas, speeds, count: travelCount }

      for (let i = 0; i < travelCount; i++) {
        const i3 = i * 3
        const t = Math.random()
        const p = new THREE.Vector3().lerpVectors(this.source, this.target, t)
        positions[i3 + 0] = p.x - this.target.x
        positions[i3 + 1] = p.y - this.target.y + 0.2
        positions[i3 + 2] = p.z - this.target.z
        alphas[i] = 0.8 + Math.random() * 0.2
        speeds[i] = 0.25 + Math.random() * 0.6
      }

      this.geomTravel = new THREE.BufferGeometry()
      this.geomTravel.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      this.matTravel = new THREE.PointsMaterial({
        size: 0.12,
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      this.travelPoints = new THREE.Points(this.geomTravel, this.matTravel)
      this.group.add(this.travelPoints)
    }

    // Registrar al loop de tiempo global
    this.experience.time.on('tick', this.update)

    // Limpieza automática (puedes ajustar)
    this.autoDisposeTimeout = setTimeout(() => this.dispose(), 12000)
  }

  // Crea un anillo que asciende mientras se expande y desvanece
  _spawnRisingRing() {
    if (this.rings.length >= this.maxRings) return

    const inner = this.portalRadius * 0.5
    const outer = inner + 0.32
    const geom = new THREE.RingGeometry(inner, outer, 48, 1)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9a6bff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    const ring = new THREE.Mesh(geom, mat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.02

    // atributos de animación
    ring.userData = {
      life: 1.0,
      rise: 0.8 + Math.random() * 0.5,
      expand: 0.55 + Math.random() * 0.35,
      fade: 0.9 + Math.random() * 0.5
    }

    this.group.add(ring)
    this.rings.push(ring)
  }

  update = () => {
    const dt = this.clock.getDelta()
    const t  = this.clock.elapsedTime

    // Rotación sutil del conjunto
    this.group.rotation.y += dt * 0.35

    // ---------- Actualizar vórtice externo ----------
    {
      const pos = this.geomOuter.attributes.position.array
      for (let i = 0; i < this.countOuter; i++) {
        const i3 = i * 3
        this.anglesOuter[i] += this.spinSpeedOuter * dt
        this.radiiOuter[i]  *= this.inwardDamp
        this.heightsOuter[i]+= dt * this.riseSpeed * 0.25

        // reposición cuando llegue muy adentro o arriba
        if (this.radiiOuter[i] < 0.25 || this.heightsOuter[i] > this.vortexHeight) {
          this.radiiOuter[i]   = this.portalRadius + Math.random() * 2.0
          this.heightsOuter[i] = -this.vortexHeight * 0.3
        }

        pos[i3 + 0] = Math.cos(this.anglesOuter[i]) * this.radiiOuter[i]
        pos[i3 + 1] = this.heightsOuter[i]
        pos[i3 + 2] = Math.sin(this.anglesOuter[i]) * this.radiiOuter[i]
      }
      this.geomOuter.attributes.position.needsUpdate = true
    }

    // ---------- Actualizar vórtice interno ----------
    {
      const pos = this.geomInner.attributes.position.array
      for (let i = 0; i < this.countInner; i++) {
        const i3 = i * 3
        this.anglesInner[i] -= this.spinSpeedInner * dt
        this.radiiInner[i]  *= (this.inwardDamp - 0.005)
        this.heightsInner[i]+= dt * this.riseSpeed * 0.45

        if (this.radiiInner[i] < 0.15 || this.heightsInner[i] > this.vortexHeight * 0.75) {
          this.radiiInner[i]   = 0.4 + Math.random() * (this.portalRadius * 0.9)
          this.heightsInner[i] = -this.vortexHeight * 0.25
        }

        pos[i3 + 0] = Math.cos(this.anglesInner[i]) * this.radiiInner[i]
        pos[i3 + 1] = this.heightsInner[i]
        pos[i3 + 2] = Math.sin(this.anglesInner[i]) * this.radiiInner[i]
      }
      this.geomInner.attributes.position.needsUpdate = true
    }

    // ---------- Aro pulsante ----------
    const pulse = 1 + Math.sin(t * 3.2) * 0.12
    this.torus.scale.set(pulse, pulse, pulse)
    this.torus.material.opacity = 0.7 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.4))

    // ---------- Haz vertical ----------
    this.beam.material.opacity = 0.12 + 0.10 * (0.5 + 0.5 * Math.sin(t * 4.0))
    this.beam.rotation.y += dt * 0.6

    // ---------- Disco de brillo ----------
    this.glow.material.opacity = 0.45 + 0.25 * (0.5 + 0.5 * Math.cos(t * 2.1))
    const glowPulse = 1 + 0.08 * Math.sin(t * 2.1 + Math.PI / 4)
    this.glow.scale.set(glowPulse, glowPulse, glowPulse)

    // ---------- Anillos ascendentes ----------
    this.elapsedSinceRing += dt
    if (this.elapsedSinceRing >= this.ringSpawnEvery) {
      this.elapsedSinceRing = 0
      this._spawnRisingRing()
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      const u = r.userData
      r.position.y += dt * u.rise
      r.scale.x += dt * u.expand
      r.scale.y += dt * u.expand
      r.material.opacity *= Math.pow(1 - dt * u.fade, 1.0)
      u.life -= dt
      if (u.life <= 0 || r.material.opacity < 0.03) {
        r.geometry.dispose()
        r.material.dispose()
        this.group.remove(r)
        this.rings.splice(i, 1)
      }
    }

    // ---------- Partículas en tránsito (source → portal) ----------
    if (this.travelData) {
      const p = this.travelData.positions
      for (let i = 0; i < this.travelData.count; i++) {
        const i3 = i * 3
        // acercar al centro con una espiral suave
        const vx = -p[i3 + 0] * 0.7
        const vz = -p[i3 + 2] * 0.7
        const swirl = 0.6
        const nx = p[i3 + 2] * swirl
        const nz = -p[i3 + 0] * swirl

        p[i3 + 0] += (vx + nx) * dt * this.travelData.speeds[i]
        p[i3 + 2] += (vz + nz) * dt * this.travelData.speeds[i]
        p[i3 + 1] += dt * 0.25

        // si está muy cerca del centro, reaparece alrededor
        const r2 = p[i3 + 0] * p[i3 + 0] + p[i3 + 2] * p[i3 + 2]
        if (r2 < 0.05) {
          const ang = Math.random() * Math.PI * 2
          const rad = this.portalRadius + Math.random() * 2.5
          p[i3 + 0] = Math.cos(ang) * rad
          p[i3 + 1] = 0.1 + Math.random() * 0.5
          p[i3 + 2] = Math.sin(ang) * rad
        }
      }
      this.geomTravel.attributes.position.needsUpdate = true
    }
  }

  dispose() {
    clearTimeout(this.autoDisposeTimeout)
    this.experience?.time?.off('tick', this.update)

    // eliminar anillos
    this.rings.forEach(r => {
      r.geometry?.dispose?.()
      r.material?.dispose?.()
      this.group.remove(r)
    })
    this.rings.length = 0

    // outer
    this.pointsOuter && this.group.remove(this.pointsOuter)
    this.geomOuter?.dispose?.()
    this.matOuter?.dispose?.()

    // inner
    this.pointsInner && this.group.remove(this.pointsInner)
    this.geomInner?.dispose?.()
    this.matInner?.dispose?.()

    // travel
    if (this.travelPoints) {
      this.group.remove(this.travelPoints)
      this.geomTravel?.dispose?.()
      this.matTravel?.dispose?.()
    }

    // torus
    if (this.torus) {
      this.group.remove(this.torus)
      this.torusGeom?.dispose?.()
      this.torusMat?.dispose?.()
    }

    // beam
    if (this.beam) {
      this.group.remove(this.beam)
      this.beamGeom?.dispose?.()
      this.beamMat?.dispose?.()
    }

    // glow
    if (this.glow) {
      this.group.remove(this.glow)
      this.glowGeom?.dispose?.()
      this.glowMat?.dispose?.()
    }

    this.scene.remove(this.group)
  }
}
