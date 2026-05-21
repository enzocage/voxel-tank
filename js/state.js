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
    shotMode: 'sub',
    playerWalls: { 1: [], 2: [] },
    activeShields: [],
    shieldCharges: { 1: 1, 2: 1 },
    pendingBlocks: [],

    // Multiplayer State
    isMultiplayer: false,
    localPlayerRole: null,
    playerRoleState: 'active', // 'active' or 'passive'
    lobbyId: null,
    opponentName: "",
    multiplayerStatus: "offline",
    playerUid: null,
    playerName: "Gast",
    playerWins: 0,
    playerLosses: 0,
    isHost: false,
    terrainSeed: null,

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
    waterMaterial: null,
    starfield: null,
    nebulaClouds: null,
    horizonGlow: null,
    terrainInstancedMesh: null,

    // Post-processing
    composer: null,
    bloomPass: null,
    chromaticPass: null,
    chromaticTimer: 0,

    // Transient visual effects
    transientLights: [],

    // Impact camera zoom
    impactCameraTarget: null,
    impactCameraTimer: 0,

    // Victory cinematic
    victoryCinematicActive: false,
    victoryCinematicTarget: null,
    victoryOrbitAngle: 0,

    // Engine hum tracking
    engineHumming: false,
};

// Global object pools/lists
export const tanks = [];
export const projectiles = [];
export const particles = [];
export const effects = [];
export const movementHighlights = [];
