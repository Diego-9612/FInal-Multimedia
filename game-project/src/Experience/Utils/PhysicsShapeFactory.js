import * as CANNON from 'cannon-es'
import * as THREE from 'three'

export function createBoxShapeFromModel(model, shrink = 0.95) {
  const bbox = new THREE.Box3().setFromObject(model)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  bbox.getSize(size)
  bbox.getCenter(center)

  // half-extents con pequeño “shrink” para evitar enganche con visual
  const hx = Math.max(0.001, (size.x * shrink) / 2)
  const hy = Math.max(0.001, (size.y * shrink) / 2)
  const hz = Math.max(0.001, (size.z * shrink) / 2)

  return new CANNON.Box(new CANNON.Vec3(hx, hy, hz))
}

export function createTrimeshShapeFromModel(model) {
  const mergedPositions = []
  const mergedIndices = []
  let vertexOffset = 0

  model.updateMatrixWorld(true)

  model.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const geometry = child.geometry.clone().toNonIndexed()
      const position = geometry.attributes.position
      if (!position) return
      const vertexCount = position.count

      for (let i = 0; i < vertexCount; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(position, i)
        v.applyMatrix4(child.matrixWorld)
        mergedPositions.push(v.x, v.y, v.z)
      }
      for (let i = 0; i < vertexCount / 3; i++) {
        mergedIndices.push(
          vertexOffset + i * 3,
          vertexOffset + i * 3 + 1,
          vertexOffset + i * 3 + 2
        )
      }
      vertexOffset += vertexCount
    }
  })

  if (mergedPositions.length === 0) {
    console.warn('❌ No se pudo construir un Trimesh: modelo sin vértices')
    return null
  }

  const vertices = new Float32Array(mergedPositions)
  const indices = new Uint16Array(mergedIndices)
  return new CANNON.Trimesh(vertices, indices)
}
