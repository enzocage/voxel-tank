// Shared Game State and Three.js references

export const state = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    
    currentPhase: 'SELECT', // 'SELECT', 'MOVE', 'AIM'
    activePlayer: 1,
    selectedTank: null,
    actionsRemaining: 15,
    isCharging: false,
    chargeStartTime: 0,
    isGameOver: false,
    keysPressed: {},
    moveCooldown: false,
    shotMode: 'sub', // 'sub' (destructive), 'add' (constructive), 'wall' (purple wall), 'shield' (dome)
    playerWalls: { 1: [], 2: [] },
    activeShields: [], // List of { owner, center, radius, turnsLeft, mesh, textSprite }
    shieldCharges: { 1: 1, 2: 1 }, // Each player gets exactly 1 shield deployment per game
    pendingBlocks: [], // Queued voxel placements { x, y, z, blockType, targetTime }
    
    windDirection: Math.random() * Math.PI * 2,
    windSpeed: Math.floor(Math.random() * 8),
    
    useActionCam: true,
    cameraLerpTarget: null,
    screenShakeIntensity: 0,
    cameraTransitioning: false,
    
    camTargetPos: new THREE.Vector3(),
    camTargetLook: new THREE.Vector3(),
    
    trajectoryMesh: null,
    waterPlane: null,
    starfield: null,
    terrainInstancedMesh: null
};

// Global object pools/lists
export const tanks = [];
export const projectiles = [];
export const particles = [];
export const movementHighlights = [];
