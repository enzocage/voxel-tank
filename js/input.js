// Keyboard, Mouse, and Touch input handling
import { BLOCK_SIZE, GRID_SIZE_X, GRID_SIZE_Z, getCardinalDirectionFromYaw } from './constants.js?v=22';
import { state, tanks, projectiles } from './state.js?v=22';
import { getSurfaceY } from './terrain.js?v=22';
import { playSound, startEngineHum, stopEngineHum } from './audio.js?v=22';
import { Projectile } from './projectile.js?v=22';
import {
    setPhase,
    selectTank,
    updateUI,
    highlightPossibleMoves,
    clearHighlights,
    adjustCameraFocusOnTank,
    deployShield,
    nextTurn
} from './ui.js?v=22';
import { syncActiveTankState, syncActionsRemaining, syncShotLaunch } from './multiplayer.js?v=22';

function isLocalTurn() {
    if (state.isMultiplayer) return state.activePlayer === state.localPlayerRole;
    return true;
}

export function attemptStep(dx, dz) {
    if (!state.selectedTank || state.actionsRemaining <= 0) return;
    if (!isLocalTurn()) return;

    const nx = state.selectedTank.x + dx;
    const nz = state.selectedTank.z + dz;

    if (nx >= 0 && nx < GRID_SIZE_X && nz >= 0 && nz < GRID_SIZE_Z) {
        const isOccupied = tanks.some(t => t.x === nx && t.z === nz);
        if (!isOccupied) {
            const targetY = getSurfaceY(nx, nz);
            const currentY = state.selectedTank.y;

            if (targetY > 0 && Math.abs(targetY - currentY) <= 1) {
                state.selectedTank.x = nx;
                state.selectedTank.z = nz;
                state.selectedTank.y = targetY;

                state.actionsRemaining--;
                playSound('move');
                state.selectedTank.updateMeshPosition();

                adjustCameraFocusOnTank(state.selectedTank);
                highlightPossibleMoves();
                updateUI();

                if (state.isMultiplayer) {
                    syncActiveTankState();
                    syncActionsRemaining(state.actionsRemaining);
                }

                if (state.actionsRemaining <= 0) {
                    setTimeout(() => setPhase('AIM'), 300);
                }
            }
        }
    }
}

export function startCharging() {
    state.isCharging = true;
    state.chargeStartTime = performance.now();
}

export function fireProjectile() {
    state.isCharging = false;

    if (state.shotMode === 'shield') {
        const ex = state.selectedTank.mesh.position.x;
        const ey = state.selectedTank.mesh.position.y;
        const ez = state.selectedTank.mesh.position.z;

        deployShield(ex, ey, ez, state.activePlayer);

        if (state.isMultiplayer) syncShotLaunch(state.selectedTank.id, 'shield', 0, 0, 0);

        document.getElementById('power-bar').style.width = '0%';
        document.getElementById('power-percentage').innerText = '0%';
        state.trajectoryMesh.geometry = new THREE.BufferGeometry();

        clearHighlights();
        updateUI();

        setTimeout(() => {
            if (state.isMultiplayer) {
                const nextRole = (state.localPlayerRole === 1) ? 2 : 1;
                import('./multiplayer.js?v=22').then(mp => { mp.syncNextTurn(nextRole); });
            } else {
                nextTurn();
            }
        }, 1600);
        return;
    }

    const yaw = state.selectedTank.bodyYaw + state.selectedTank.turretYaw;
    const pitch = state.selectedTank.barrelPitch;

    const dirX = Math.sin(yaw) * Math.cos(pitch);
    const dirY = Math.sin(pitch);
    const dirZ = Math.cos(yaw) * Math.cos(pitch);

    const barrelLength = 2.0;
    const startX = state.selectedTank.x * BLOCK_SIZE + dirX * barrelLength;
    const startY = (state.selectedTank.y - 0.25) * BLOCK_SIZE + dirY * barrelLength;
    const startZ = state.selectedTank.z * BLOCK_SIZE + dirZ * barrelLength;

    const elapsed = performance.now() - state.chargeStartTime;
    const power = Math.min(1.0, elapsed / 1500);
    const speed = 8.0 + (power * (28.0 - 8.0));
    const velocity = new THREE.Vector3(dirX * speed, dirY * speed, dirZ * speed);

    if (state.isMultiplayer) syncShotLaunch(state.selectedTank.id, state.shotMode, yaw, pitch, speed);

    // Barrel recoil
    if (state.selectedTank.triggerRecoil) state.selectedTank.triggerRecoil();

    // Muzzle flash point light
    const muzzleLight = new THREE.PointLight(0xffffff, 10, 18);
    muzzleLight.position.set(startX, startY, startZ);
    state.scene.add(muzzleLight);
    state.transientLights.push({ light: muzzleLight, duration: 0.09, elapsed: 0, initialIntensity: 10 });

    projectiles.push(new Projectile(startX, startY, startZ, velocity, state.selectedTank));
    playSound('shoot');

    // Shell casing sound with slight delay
    setTimeout(() => playSound('shell_casing'), 130);

    document.getElementById('power-bar').style.width = '0%';
    document.getElementById('power-percentage').innerText = '0%';
    if (state.trajectoryMesh) state.trajectoryMesh.geometry = new THREE.BufferGeometry();

    clearHighlights();
    updateUI();
}

export function setupInput() {
    window.addEventListener('keydown', (e) => {
        if (!isLocalTurn()) return;
        state.keysPressed[e.code] = true;

        if (state.currentPhase === 'MOVE' && state.selectedTank && !state.moveCooldown) {
            let dx = 0, dz = 0;

            if (e.code === 'KeyW' || e.code === 'ArrowUp') {
                const absoluteYaw = state.selectedTank.bodyYaw + state.selectedTank.turretYaw;
                const dir = getCardinalDirectionFromYaw(absoluteYaw, true);
                dx = dir.dx; dz = dir.dz;
            } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
                const absoluteYaw = state.selectedTank.bodyYaw + state.selectedTank.turretYaw;
                const dir = getCardinalDirectionFromYaw(absoluteYaw, false);
                dx = dir.dx; dz = dir.dz;
            }

            if (dx !== 0 || dz !== 0) {
                e.preventDefault();
                attemptStep(dx, dz);
                state.moveCooldown = true;
                setTimeout(() => { state.moveCooldown = false; }, 180);
            }

            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                playSound('click');
                setPhase('AIM');
                state.keysPressed['Space'] = false;
            }
        }

        if (state.currentPhase === 'AIM' && e.code === 'Space' && !e.repeat && state.selectedTank && projectiles.length === 0 && !state.isGameOver) {
            e.preventDefault();
            startCharging();
        }
    });

    window.addEventListener('keyup', (e) => {
        if (!isLocalTurn()) return;
        state.keysPressed[e.code] = false;

        // Stop engine hum when movement keys released
        if (!state.keysPressed['KeyA'] && !state.keysPressed['KeyD'] &&
            !state.keysPressed['ArrowLeft'] && !state.keysPressed['ArrowRight'] &&
            !state.keysPressed['KeyW'] && !state.keysPressed['KeyS']) {
            if (state.engineHumming) {
                stopEngineHum();
                state.engineHumming = false;
            }
        }

        if (state.currentPhase === 'AIM' && e.code === 'Space' && state.isCharging) {
            e.preventDefault();
            fireProjectile();
        }
    });

    const shootBtn = document.getElementById('shoot-button');
    shootBtn.addEventListener('mousedown', () => {
        if (!isLocalTurn()) return;
        if (state.currentPhase === 'AIM' && state.selectedTank && projectiles.length === 0 && !state.isGameOver) startCharging();
    });
    shootBtn.addEventListener('mouseup', () => {
        if (!isLocalTurn()) return;
        if (state.isCharging) fireProjectile();
    });
    shootBtn.addEventListener('touchstart', (e) => {
        if (!isLocalTurn()) return;
        e.preventDefault();
        if (state.currentPhase === 'AIM' && state.selectedTank && projectiles.length === 0 && !state.isGameOver) startCharging();
    });
    shootBtn.addEventListener('touchend', (e) => {
        if (!isLocalTurn()) return;
        e.preventDefault();
        if (state.isCharging) fireProjectile();
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let clickStartX = 0, clickStartY = 0, clickStartTime = 0;
    let lastClickTime = 0, lastClickedTankId = null;

    function handleSelectClick(clientX, clientY) {
        if (!isLocalTurn()) return;
        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, state.camera);
        const intersects = raycaster.intersectObjects(state.scene.children, true);
        let clickedTank = null;
        for (let hit of intersects) {
            let parent = hit.object;
            while (parent && parent !== state.scene) {
                const found = tanks.find(t => t.mesh === parent);
                if (found) { clickedTank = found; break; }
                parent = parent.parent;
            }
            if (clickedTank) break;
        }

        if (clickedTank && clickedTank.player === state.activePlayer) {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastClickTime;

            if (clickedTank === state.selectedTank && state.currentPhase === 'MOVE' && timeDiff < 350 && lastClickedTankId === clickedTank.id) {
                playSound('click');
                setPhase('AIM');
                lastClickTime = 0; lastClickedTankId = null;
                return;
            }

            lastClickTime = currentTime;
            lastClickedTankId = clickedTank.id;

            playSound('click');
            if (state.currentPhase === 'SELECT') {
                selectTank(clickedTank);
                setPhase('MOVE');
                lastClickTime = 0; lastClickedTankId = null;
            } else {
                selectTank(clickedTank);
            }
        }
    }

    function onPointerDown(e) {
        if (!isLocalTurn()) return;
        if (e.button !== undefined && e.button !== 0) return;
        clickStartX = e.clientX; clickStartY = e.clientY; clickStartTime = Date.now();
    }

    function onPointerUp(e) {
        if (!isLocalTurn()) return;
        if (e.button !== undefined && e.button !== 0) return;
        const dist = Math.sqrt(Math.pow(e.clientX - clickStartX, 2) + Math.pow(e.clientY - clickStartY, 2));
        const duration = Date.now() - clickStartTime;
        if (dist < 8 && duration < 350) handleSelectClick(e.clientX, e.clientY);
    }

    if (state.renderer && state.renderer.domElement) {
        state.renderer.domElement.addEventListener('pointerdown', onPointerDown);
        state.renderer.domElement.addEventListener('pointerup', onPointerUp);
    }
}
