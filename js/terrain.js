// Voxel Grid management and Terrain Generation
import { GRID_SIZE_X, GRID_SIZE_Y, GRID_SIZE_Z, BLOCK_SIZE, PALETTE } from './constants.js?v=21';
import { state } from './state.js?v=21';

export const voxelGrid = new Uint8Array(GRID_SIZE_X * GRID_SIZE_Y * GRID_SIZE_Z);

function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

export function getGridIndex(x, y, z) {
    return x + y * GRID_SIZE_X + z * GRID_SIZE_X * GRID_SIZE_Y;
}

export function getBlock(x, y, z) {
    if (x < 0 || x >= GRID_SIZE_X || y < 0 || y >= GRID_SIZE_Y || z < 0 || z >= GRID_SIZE_Z) return 0;
    return voxelGrid[getGridIndex(x, y, z)];
}

export function setBlock(x, y, z, val) {
    if (x < 0 || x >= GRID_SIZE_X || y < 0 || y >= GRID_SIZE_Y || z < 0 || z >= GRID_SIZE_Z) return;
    voxelGrid[getGridIndex(x, y, z)] = val;
}

export function getSurfaceY(x, z) {
    for (let y = GRID_SIZE_Y - 1; y >= 0; y--) {
        if (getBlock(x, y, z) > 0) {
            return y + 1;
        }
    }
    return 0;
}

export function generateTerrain(seed) {
    const s = seed !== undefined ? seed : (state.terrainSeed !== null ? state.terrainSeed : Math.random() * 1000000);
    const seedInt = typeof s === 'string' ? parseInt(s) : Math.floor(s);
    const rng = mulberry32(seedInt);

    for (let x = 0; x < GRID_SIZE_X; x++) {
        for (let z = 0; z < GRID_SIZE_Z; z++) {
            const nx = x / GRID_SIZE_X;
            const nz = z / GRID_SIZE_Z;
            
            let height = 4 + Math.sin(nx * Math.PI * 2.5) * 2.2 + Math.cos(nz * Math.PI * 2.5) * 1.8;
            const distanceToCenter = Math.abs(nx - 0.5);
            if (distanceToCenter < 0.12) {
                height = Math.max(1, height - 5);
            }
            
            height = Math.floor(Math.max(1, Math.min(GRID_SIZE_Y - 2, height)));
            
            for (let y = 0; y < GRID_SIZE_Y; y++) {
                if (y < height - 1) {
                    setBlock(x, y, z, rng() < 0.08 ? 2 : 1);
                } else if (y === height - 1) {
                    const r = rng();
                    const blockType = r < 0.85 ? 3 : (r < 0.93 ? 4 : 5);
                    setBlock(x, y, z, blockType);
                } else {
                    setBlock(x, y, z, 0);
                }
            }
        }
    }
}

export function buildTerrainMesh() {
    if (state.terrainInstancedMesh) {
        state.scene.remove(state.terrainInstancedMesh);
    }

    let totalBlocks = 0;
    for (let i = 0; i < voxelGrid.length; i++) {
        if (voxelGrid[i] > 0) totalBlocks++;
    }

    const geometry = new THREE.BoxGeometry(BLOCK_SIZE * 0.98, BLOCK_SIZE * 0.98, BLOCK_SIZE * 0.98); 
    const material = new THREE.MeshStandardMaterial({ 
        roughness: 0.7,
        metalness: 0.2
    });

    state.terrainInstancedMesh = new THREE.InstancedMesh(geometry, material, totalBlocks);
    state.terrainInstancedMesh.castShadow = true;
    state.terrainInstancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let idx = 0;

    for (let x = 0; x < GRID_SIZE_X; x++) {
        for (let y = 0; y < GRID_SIZE_Y; y++) {
            for (let z = 0; z < GRID_SIZE_Z; z++) {
                const type = getBlock(x, y, z);
                if (type > 0) {
                    dummy.position.set(x * BLOCK_SIZE, y * BLOCK_SIZE, z * BLOCK_SIZE);
                    dummy.updateMatrix();
                    state.terrainInstancedMesh.setMatrixAt(idx, dummy.matrix);
                    
                    let hexColor = PALETTE[type];
                    if (type === 1 || type === 3) {
                        const mult = 0.5 + (y / GRID_SIZE_Y) * 0.5;
                        color.setHex(hexColor).multiplyScalar(mult);
                    } else {
                        color.setHex(hexColor);
                    }
                    
                    state.terrainInstancedMesh.setColorAt(idx, color);
                    idx++;
                }
            }
        }
    }

    state.terrainInstancedMesh.instanceMatrix.needsUpdate = true;
    if (state.terrainInstancedMesh.instanceColor) {
        state.terrainInstancedMesh.instanceColor.needsUpdate = true;
    }
    state.scene.add(state.terrainInstancedMesh);
}
