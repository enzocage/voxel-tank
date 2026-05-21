// Online Multiplayer Matchmaking and State Synchronization Module
import { db } from './firebase-config.js?v=23';
import { state, tanks } from './state.js?v=23';
import { getBlock, setBlock, buildTerrainMesh, getSurfaceY } from './terrain.js?v=23';
import { playSound } from './audio.js?v=23';
import { spawnExplosion } from './particles.js?v=23';
import { Projectile } from './projectile.js?v=23';
import { recordMatchResult } from './auth.js?v=23';
import { 
    ref, 
    set, 
    get, 
    update, 
    onValue, 
    push, 
    onChildAdded, 
    remove, 
    onDisconnect,
    off
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

let dbListeners = [];

// Helper to generate a random 4-character uppercase lobby code
function generateLobbyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Create a new lobby
export async function createLobby() {
    if (!db) throw new Error("Firebase Database is not initialized.");
    
    const lobbyId = generateLobbyCode();
    state.lobbyId = lobbyId;
    state.isMultiplayer = true;
    state.localPlayerRole = 1; // Host is Player 1
    state.isHost = true;
    state.multiplayerStatus = 'waiting';
    state.activePlayer = 1;
    
    // Generate a random seed for terrain generation
    state.terrainSeed = Math.floor(Math.random() * 10000000);
    
    const lobbyRef = ref(db, `lobbies/${lobbyId}`);
    
    const lobbyData = {
        lobbyId: lobbyId,
        status: 'waiting',
        creatorUid: state.playerUid || 'guest_host',
        creatorName: state.playerName,
        player1: {
            uid: state.playerUid || 'guest_host',
            name: state.playerName
        },
        player2: null,
        terrainSeed: state.terrainSeed,
        activePlayer: 1,
        currentPhase: 'SELECT',
        selectedTankId: null,
        actionsRemaining: 15,
        timestamp: Date.now()
    };
    
    await set(lobbyRef, lobbyData);
    
    // Handle disconnect cleanup
    const p1DisconnectRef = ref(db, `lobbies/${lobbyId}/player1Disconnected`);
    onDisconnect(p1DisconnectRef).set(true);
    
    setupLobbyListeners(lobbyId);
    return lobbyId;
}

// Join an existing lobby by code
export async function joinLobby(lobbyId) {
    if (!db) throw new Error("Firebase Database is not initialized.");
    
    lobbyId = lobbyId.toUpperCase().trim();
    const lobbyRef = ref(db, `lobbies/${lobbyId}`);
    
    const snapshot = await get(lobbyRef);
    if (!snapshot.exists()) {
        throw new Error("Lobby existiert nicht.");
    }
    
    const lobbyData = snapshot.val();
    if (lobbyData.status !== 'waiting' || lobbyData.player2) {
        throw new Error("Lobby ist bereits voll oder das Spiel läuft schon.");
    }
    
    state.lobbyId = lobbyId;
    state.isMultiplayer = true;
    state.localPlayerRole = 2; // Joiner is Player 2
    state.isHost = false;
    state.multiplayerStatus = 'playing';
    state.terrainSeed = lobbyData.terrainSeed;
    state.opponentName = lobbyData.creatorName;
    state.opponentUid = lobbyData.creatorUid;
    
    // Update lobby database entry
    const player2Data = {
        uid: state.playerUid || 'guest_joiner',
        name: state.playerName
    };
    
    await update(lobbyRef, {
        player2: player2Data,
        status: 'playing'
    });
    
    // Handle disconnect cleanup
    const p2DisconnectRef = ref(db, `lobbies/${lobbyId}/player2Disconnected`);
    onDisconnect(p2DisconnectRef).set(true);
    
    setupLobbyListeners(lobbyId);

    // Start the game for Player 2!
    import('./ui.js?v=23').then(ui => {
        ui.startMultiplayerGame(state.terrainSeed);
    });
}

// Clear all active database listeners
export function clearMultiplayerListeners() {
    if (!db) return;
    dbListeners.forEach(item => {
        off(ref(db, item.path));
    });
    dbListeners = [];
}

// Set up listeners for synchronized database updates
function setupLobbyListeners(lobbyId) {
    if (!db) return;
    
    clearMultiplayerListeners();
    
    const lobbyRef = ref(db, `lobbies/${lobbyId}`);
    
    // 1. General Lobby changes (Status, Active Player, Phase, Action counter)
    const statusListener = onValue(lobbyRef, (snapshot) => {
        if (!snapshot.exists()) {
            console.log("Lobby was deleted.");
            handleOpponentDisconnect("Lobby wurde geschlossen.");
            return;
        }
        
        const data = snapshot.val();
        
        // Host gets the opponent details when they join
        if (state.isHost && data.player2 && state.multiplayerStatus === 'waiting') {
            state.opponentName = data.player2.name;
            state.opponentUid = data.player2.uid;
            state.multiplayerStatus = 'playing';
            // Start the actual game! Trigger UI updates.
            import('./ui.js?v=23').then(ui => {
                ui.showAnnouncement(`Spieler 2 (${state.opponentName}) beigetreten!`);
                ui.startMultiplayerGame(state.terrainSeed);
            });
        }
        
        // Turn transition: active player changed — handle immediately so camera is always correct
        if (data.activePlayer !== undefined && data.activePlayer !== state.activePlayer) {
            console.log('[MP] Turn transition | old activePlayer:', state.activePlayer, '→ new:', data.activePlayer, '| localRole:', state.localPlayerRole, '| cameraLerpTarget?', !!state.cameraLerpTarget, '| cameraTransitioning:', state.cameraTransitioning);
            state.activePlayer = data.activePlayer; // Sync guard: prevents duplicate nextTurn calls
            import('./ui.js?v=23').then(ui => {
                console.log('[MP] calling nextTurn(', data.activePlayer, ')');
                ui.nextTurn(data.activePlayer);
            }).catch(err => console.error('[MP] nextTurn call failed:', err));
            return; // nextTurn→setPhase resets selectedTank, actionsRemaining and camera
        }

        // Intermediate phase sync for the remote player's turn (SELECT→MOVE→AIM)
        if (data && data.activePlayer !== state.localPlayerRole) {
            if (data.currentPhase && data.currentPhase !== state.currentPhase) {
                import('./ui.js?v=23').then(ui => ui.setPhase(data.currentPhase));
            }
            if (data.actionsRemaining !== undefined) {
                state.actionsRemaining = data.actionsRemaining;
            }
            // Selected Tank syncing — update state and focus camera on the opponent's tank or overview
            if (data.selectedTankId !== undefined) {
                const foundTank = tanks.find(t => t.id === data.selectedTankId);
                if (foundTank && state.selectedTank !== foundTank) {
                    state.selectedTank = foundTank;
                    import('./ui.js?v=23').then(ui => {
                        ui.adjustCameraFocusOnTank(foundTank);
                        ui.updateUI();
                    });
                } else if (data.selectedTankId === null && state.selectedTank !== null) {
                    state.selectedTank = null;
                    import('./ui.js?v=23').then(ui => {
                        const activeTanks = tanks.filter(t => t.player === state.activePlayer);
                        ui.adjustCameraToFitTanks(activeTanks);
                        ui.updateUI();
                    });
                }
            }
        }
    });
    dbListeners.push({ path: `lobbies/${lobbyId}`, listener: statusListener });

    // 2. Active Tank real-time movement/aim synchronization
    const activeTankRef = ref(db, `lobbies/${lobbyId}/activeTankState`);
    const activeTankListener = onValue(activeTankRef, (snapshot) => {
        if (state.activePlayer === state.localPlayerRole) return; // Ignore own movements
        if (snapshot.exists()) {
            const data = snapshot.val();
            const tank = tanks.find(t => t.id === data.id);
            if (tank) {
                const moved = (tank.x !== data.x || tank.y !== data.y || tank.z !== data.z);
                tank.x = data.x;
                tank.y = data.y;
                tank.z = data.z;
                tank.bodyYaw = data.bodyYaw;
                tank.turretYaw = data.turretYaw;
                tank.barrelPitch = data.barrelPitch;
                tank.updateMeshPosition();

                if (moved) {
                    import('./ui.js?v=23').then(ui => {
                        ui.adjustCameraFocusOnTank(tank);
                    });
                }
            }
        }
    });
    dbListeners.push({ path: `lobbies/${lobbyId}/activeTankState`, listener: activeTankListener });
    
    // 3. Sync Shot Launches
    const shotLaunchRef = ref(db, `lobbies/${lobbyId}/shotLaunch`);
    const shotLaunchListener = onValue(shotLaunchRef, (snapshot) => {
        if (state.activePlayer === state.localPlayerRole) return; // Only process remote shots
        if (snapshot.exists()) {
            const data = snapshot.val();
            // Trigger projectile simulation locally
            const tank = tanks.find(t => t.id === data.shooterId);
            if (tank) {
                console.log("Remote player fired. Simulating flight...", data);
                
                // Set correct weapon mode locally
                state.shotMode = data.mode;
                import('./ui.js?v=23').then(ui => ui.updateUI());
                
                if (data.mode === 'shield') {
                    // Shield is instantiated instantly
                    import('./ui.js?v=23').then(ui => {
                        ui.deployShield(tank.mesh.position.x, tank.mesh.position.y, tank.mesh.position.z, state.activePlayer);
                    });
                } else {
                    // Normal projectile flight
                    const yaw = data.yaw;
                    const pitch = data.pitch;
                    const speed = data.speed;
                    
                    const dirX = Math.sin(yaw) * Math.cos(pitch);
                    const dirY = Math.sin(pitch);
                    const dirZ = Math.cos(yaw) * Math.cos(pitch);
                    
                    const barrelLength = 2.0;
                    const startX = tank.x * 2.0 + dirX * barrelLength; // BLOCK_SIZE = 2.0
                    const startY = (tank.y - 0.25) * 2.0 + dirY * barrelLength;
                    const startZ = tank.z * 2.0 + dirZ * barrelLength;
                    
                    const velocity = new THREE.Vector3(dirX * speed, dirY * speed, dirZ * speed);
                    
                    // Create local projectile representing opponent's projectile
                    const p = new Projectile(startX, startY, startZ, velocity, data.mode, tank);
                    // Disable collision writing for remote projectiles, since we listen to definitive blockChanges
                    p.isRemoteSimulation = true; 
                }
            }
        }
    });
    dbListeners.push({ path: `lobbies/${lobbyId}/shotLaunch`, listener: shotLaunchListener });

    // 4. Listen for block changes and damage updates (Option B: Server of Truth)
    const blockChangesRef = ref(db, `lobbies/${lobbyId}/blockChanges`);
    const blockChangesListener = onChildAdded(blockChangesRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            console.log("Applying definitive block and damage updates from shooter:", data);
            
            // Execute sound effect
            if (data.sound) {
                playSound(data.sound);
            }
            
            // Queue blocks with timing offset to trigger sequential building animation
            if (data.blocks && data.blocks.length > 0) {
                if (!state.pendingBlocks) state.pendingBlocks = [];
                const startTime = performance.now();
                
                data.blocks.forEach(b => {
                    state.pendingBlocks.push({
                        x: b.x,
                        y: b.y,
                        z: b.z,
                        blockType: b.type,
                        targetTime: startTime + (b.delay || 0)
                    });
                });
            }
            
            // Apply damage/health updates exactly
            if (data.damage && data.damage.length > 0) {
                data.damage.forEach(dmg => {
                    const tank = tanks.find(t => t.id === dmg.id);
                    if (tank) {
                        const prevHp = tank.hp;
                        tank.hp = dmg.hp;
                        // Spawn floating damage popup
                        if (prevHp > tank.hp) {
                            const loss = prevHp - tank.hp;
                            import('./ui.js?v=23').then(ui => {
                                ui.showDamagePopup(loss, tank.mesh, (tank.player === 1) ? 0x10b981 : 0xf43f5e);
                            });
                        }
                        
                        // Handle destruction
                        if (tank.hp <= 0 && tank.mesh.parent) {
                            spawnExplosion(tank.mesh.position, (tank.player === 1) ? 0x10b981 : 0xf43f5e, 40);
                            state.scene.remove(tank.mesh);
                        }
                    }
                });
            }
            
            // Trigger UI and Victory Check
            import('./ui.js?v=23').then(ui => {
                ui.updateUI();
                ui.checkVictory();
            });
        }
    });
    dbListeners.push({ path: `lobbies/${lobbyId}/blockChanges`, listener: blockChangesListener });
    
    // 5. Listen to next turn triggers (authoritative wind source + backup turn handler)
    const nextTurnRef = ref(db, `lobbies/${lobbyId}/nextTurnTrigger`);
    const nextTurnListener = onValue(nextTurnRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            // Always update wind synchronously so nextTurn→updateWindUI shows correct values
            if (data.windDirection !== undefined) state.windDirection = data.windDirection;
            if (data.windSpeed !== undefined) state.windSpeed = data.windSpeed;
            // Backup: lobby listener updates state.activePlayer synchronously first,
            // so this guard is usually FALSE. Fires only if lobby listener missed the transition.
            console.log('[MP] nextTurnTrigger | data.activePlayer:', data.activePlayer, '| state.activePlayer:', state.activePlayer, '| lerpTarget?', !!state.cameraLerpTarget);
            if (data.activePlayer !== state.activePlayer) {
                console.log('[MP] nextTurnTrigger BACKUP → calling nextTurn(', data.activePlayer, ')');
                state.activePlayer = data.activePlayer;
                import('./ui.js?v=23').then(ui => ui.nextTurn(data.activePlayer)).catch(err => console.error('[MP] backup nextTurn failed:', err));
            }
        }
    });
    dbListeners.push({ path: `lobbies/${lobbyId}/nextTurnTrigger`, listener: nextTurnListener });
    
    // 6. Listen for disconnect events
    const player1DRef = ref(db, `lobbies/${lobbyId}/player1Disconnected`);
    const player1DListener = onValue(player1DRef, (snapshot) => {
        if (snapshot.exists() && snapshot.val() === true) {
            handleOpponentDisconnect("Spieler 1 hat das Spiel verlassen.");
        }
    });
    dbListeners.push({ path: `lobbies/${lobbyId}/player1Disconnected`, listener: player1DListener });
    
    const player2DRef = ref(db, `lobbies/${lobbyId}/player2Disconnected`);
    const player2DListener = onValue(player2DRef, (snapshot) => {
        if (snapshot.exists() && snapshot.val() === true) {
            handleOpponentDisconnect("Spieler 2 hat das Spiel verlassen.");
        }
    });
    dbListeners.push({ path: `lobbies/${lobbyId}/player2Disconnected`, listener: player2DListener });
}

// Handler when opponent disconnects
function handleOpponentDisconnect(reason) {
    if (state.multiplayerStatus === 'playing' && !state.isGameOver) {
        state.multiplayerStatus = 'disconnected';
        import('./ui.js?v=23').then(async (ui) => {
            ui.showAnnouncement(reason);
            // Declare winner since opponent quit
            state.isGameOver = true;
            
            const localRole = state.localPlayerRole;
            const myUid = state.playerUid;
            
            // Record win for us!
            if (myUid) {
                await recordMatchResult(myUid, null);
            }
            
            const modal = document.getElementById('game-over-modal');
            const winnerText = document.getElementById('winner-text');
            winnerText.innerText = `Sieg durch Verbindungsabbruch!\nDu hast gewonnen.`;
            modal.classList.remove('opacity-0', 'pointer-events-none');
            
            playSound('victory');
        });
    }
}

// -------------------------------------------------------------
// Real-time synchronization triggers (called by active player)
// -------------------------------------------------------------

export function syncActiveTankState() {
    if (!state.isMultiplayer || !db || state.activePlayer !== state.localPlayerRole) return;
    if (!state.selectedTank) return;
    
    const tankRef = ref(db, `lobbies/${state.lobbyId}/activeTankState`);
    set(tankRef, {
        id: state.selectedTank.id,
        x: state.selectedTank.x,
        y: state.selectedTank.y,
        z: state.selectedTank.z,
        bodyYaw: state.selectedTank.bodyYaw,
        turretYaw: state.selectedTank.turretYaw,
        barrelPitch: state.selectedTank.barrelPitch
    });
}

export function syncSelectedTank(tankId) {
    if (!state.isMultiplayer || !db || state.activePlayer !== state.localPlayerRole) return;
    const lobbyRef = ref(db, `lobbies/${state.lobbyId}`);
    update(lobbyRef, { selectedTankId: tankId });
}

export function syncPhase(phase) {
    if (!state.isMultiplayer || !db || state.activePlayer !== state.localPlayerRole) return;
    const lobbyRef = ref(db, `lobbies/${state.lobbyId}`);
    update(lobbyRef, { currentPhase: phase });
}

export function syncActionsRemaining(actions) {
    if (!state.isMultiplayer || !db || state.activePlayer !== state.localPlayerRole) return;
    const lobbyRef = ref(db, `lobbies/${state.lobbyId}`);
    update(lobbyRef, { actionsRemaining: actions });
}

// Fire launch synchronization
export function syncShotLaunch(shooterId, mode, yaw, pitch, speed) {
    if (!state.isMultiplayer || !db || state.activePlayer !== state.localPlayerRole) return;
    
    const shotLaunchRef = ref(db, `lobbies/${state.lobbyId}/shotLaunch`);
    set(shotLaunchRef, {
        shooterId: shooterId,
        mode: mode,
        yaw: yaw,
        pitch: pitch,
        speed: speed,
        timestamp: Date.now()
    });
}

// Push voxel changes and damage calculations (Definitive state)
export function syncBlockChanges(blocksList, damageList, soundName) {
    if (!state.isMultiplayer || !db || state.activePlayer !== state.localPlayerRole) return;
    
    const blockChangesRef = ref(db, `lobbies/${state.lobbyId}/blockChanges`);
    const newChangeRef = push(blockChangesRef);
    set(newChangeRef, {
        blocks: blocksList, // List of {x, y, z, type, delay}
        damage: damageList, // List of {id, hp}
        sound: soundName,
        timestamp: Date.now()
    });
}

// Trigger turn transition
export function syncNextTurn(nextPlayerRole) {
    if (!state.isMultiplayer || !db || state.activePlayer !== state.localPlayerRole) return;
    
    const lobbyRef = ref(db, `lobbies/${state.lobbyId}`);
    // Clear active state of tank
    remove(ref(db, `lobbies/${state.lobbyId}/activeTankState`));
    remove(ref(db, `lobbies/${state.lobbyId}/shotLaunch`));
    
    // In multiplayer, the active shooter randomizes the wind at the end of their turn
    const windDirection = Math.random() * Math.PI * 2;
    const windSpeed = Math.floor(Math.random() * 9);
    
    state.windDirection = windDirection;
    state.windSpeed = windSpeed;
    
    update(lobbyRef, {
        activePlayer: nextPlayerRole,
        currentPhase: 'SELECT',
        selectedTankId: null,
        actionsRemaining: 15
    });
    
    const nextTurnTriggerRef = ref(db, `lobbies/${state.lobbyId}/nextTurnTrigger`);
    set(nextTurnTriggerRef, {
        activePlayer: nextPlayerRole,
        windDirection: windDirection,
        windSpeed: windSpeed,
        timestamp: Date.now()
    });
}

// Leave lobby cleanly
export async function leaveLobby() {
    if (!state.isMultiplayer) return;
    clearMultiplayerListeners();
    
    if (db && state.lobbyId) {
        const lobbyId = state.lobbyId;
        const role = state.localPlayerRole;
        
        // Remove disconnect hooks
        off(ref(db, `lobbies/${lobbyId}/player1Disconnected`));
        off(ref(db, `lobbies/${lobbyId}/player2Disconnected`));
        
        try {
            if (state.isHost) {
                // Remove entire lobby node if host leaves
                await remove(ref(db, `lobbies/${lobbyId}`));
            } else {
                // Just clear player 2 details
                const p2Ref = ref(db, `lobbies/${lobbyId}/player2`);
                await remove(p2Ref);
                // Reset status to waiting so another can join
                await update(ref(db, `lobbies/${lobbyId}`), { status: 'waiting' });
            }
        } catch (e) {
            console.error("Clean up lobby failed:", e);
        }
    }
    
    // Reset local state
    state.isMultiplayer = false;
    state.localPlayerRole = null;
    state.lobbyId = null;
    state.opponentName = "";
    state.isHost = false;
    state.multiplayerStatus = 'offline';
}
