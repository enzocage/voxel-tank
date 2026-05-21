// Keyboard, Mouse, and Touch input handling
import { BLOCK_SIZE, GRID_SIZE_X, GRID_SIZE_Z, getCardinalDirectionFromYaw } from './constants.js?v=16';
import { state, tanks, projectiles } from './state.js?v=16';
import { getSurfaceY } from './terrain.js?v=16';
import { playSound } from './audio.js?v=16';
import { Projectile } from './projectile.js?v=16';
import { 
    setPhase, 
    selectTank, 
    updateUI, 
    highlightPossibleMoves, 
    clearHighlights,
    adjustCameraFocusOnTank,
    deployShield,
    nextTurn
} from './ui.js?v=16';

export function attemptStep(dx, dz) {
    if (!state.selectedTank || state.actionsRemaining <= 0) return;

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

                if (state.actionsRemaining <= 0) {
                    setTimeout(() => {
                        setPhase('AIM');
                    }, 300);
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
        
        document.getElementById('power-bar').style.width = '0%';
        document.getElementById('power-percentage').innerText = '0%';
        state.trajectoryMesh.geometry.setFromPoints([]);
        
        clearHighlights();
        updateUI();
        
        setTimeout(() => {
            nextTurn();
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

    const minSpeed = 8.0;
    const maxSpeed = 28.0;
    
    const elapsed = performance.now() - state.chargeStartTime;
    const power = Math.min(1.0, elapsed / 1500);
    const speed = minSpeed + (power * (maxSpeed - minSpeed));

    const velocity = new THREE.Vector3(dirX * speed, dirY * speed, dirZ * speed);

    projectiles.push(new Projectile(startX, startY, startZ, velocity, state.selectedTank));
    playSound('shoot');

    document.getElementById('power-bar').style.width = '0%';
    document.getElementById('power-percentage').innerText = '0%';
    state.trajectoryMesh.geometry.setFromPoints([]);
    
    clearHighlights();
    updateUI();
}

export function setupInput() {
    window.addEventListener('keydown', (e) => {
        state.keysPressed[e.code] = true;

        // Phase 2: BEWEGUNG
        if (state.currentPhase === 'MOVE' && state.selectedTank && !state.moveCooldown) {
            let dx = 0;
            let dz = 0;

            if (e.code === 'KeyW' || e.code === 'ArrowUp') {
                const absoluteYaw = state.selectedTank.bodyYaw + state.selectedTank.turretYaw;
                const dir = getCardinalDirectionFromYaw(absoluteYaw, true);
                dx = dir.dx;
                dz = dir.dz;
            }
            else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
                const absoluteYaw = state.selectedTank.bodyYaw + state.selectedTank.turretYaw;
                const dir = getCardinalDirectionFromYaw(absoluteYaw, false);
                dx = dir.dx;
                dz = dir.dz;
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

        // Phase 3: SCHIESSEN
        if (state.currentPhase === 'AIM' && e.code === 'Space' && !e.repeat && state.selectedTank && projectiles.length === 0 && !state.isGameOver) {
            e.preventDefault();
            startCharging();
        }
    });

    window.addEventListener('keyup', (e) => {
        state.keysPressed[e.code] = false;

        if (state.currentPhase === 'AIM' && e.code === 'Space' && state.isCharging) {
            e.preventDefault();
            fireProjectile();
        }
    });

    const shootBtn = document.getElementById('shoot-button');
    shootBtn.addEventListener('mousedown', () => {
        if (state.currentPhase === 'AIM' && state.selectedTank && projectiles.length === 0 && !state.isGameOver) {
            startCharging();
        }
    });
    shootBtn.addEventListener('mouseup', () => {
        if (state.isCharging) fireProjectile();
    });
    shootBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (state.currentPhase === 'AIM' && state.selectedTank && projectiles.length === 0 && !state.isGameOver) {
            startCharging();
        }
    });
    shootBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (state.isCharging) fireProjectile();
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let clickStartX = 0;
    let clickStartY = 0;
    let clickStartTime = 0;
    let lastClickTime = 0;
    let lastClickedTankId = null;

    function handleSelectClick(clientX, clientY) {
        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, state.camera);
        
        const intersectsTanks = raycaster.intersectObjects(state.scene.children, true);
        let clickedTank = null;
        for (let hit of intersectsTanks) {
            let parent = hit.object;
            while (parent && parent !== state.scene) {
                const found = tanks.find(t => t.mesh === parent);
                if (found) {
                    clickedTank = found;
                    break;
                }
                parent = parent.parent;
            }
            if (clickedTank) break;
        }

        if (clickedTank && clickedTank.player === state.activePlayer) {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastClickTime;

            if (clickedTank === state.selectedTank && state.currentPhase === 'MOVE' && timeDiff < 350 && lastClickedTankId === clickedTank.id) {
                // Double click/tap on the currently selected tank in MOVE phase: transition to AIM phase!
                playSound('click');
                setPhase('AIM');
                lastClickTime = 0;
                lastClickedTankId = null;
                return;
            }

            lastClickTime = currentTime;
            lastClickedTankId = clickedTank.id;

            playSound('click');
            if (state.currentPhase === 'SELECT') {
                selectTank(clickedTank);
                setPhase('MOVE');
                // Reset double click detection on phase transition to avoid accidental skip
                lastClickTime = 0;
                lastClickedTankId = null;
            } else {
                selectTank(clickedTank);
            }
        }
    }

    function onPointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        
        clickStartX = e.clientX;
        clickStartY = e.clientY;
        clickStartTime = Date.now();
    }

    function onPointerUp(e) {
        if (e.button !== undefined && e.button !== 0) return;

        const dist = Math.sqrt(Math.pow(e.clientX - clickStartX, 2) + Math.pow(e.clientY - clickStartY, 2));
        const duration = Date.now() - clickStartTime;

        // If pointer moved very little and click duration was short, treat it as a select click/tap
        if (dist < 8 && duration < 350) {
            handleSelectClick(e.clientX, e.clientY);
        }
    }

    if (state.renderer && state.renderer.domElement) {
        state.renderer.domElement.addEventListener('pointerdown', onPointerDown);
        state.renderer.domElement.addEventListener('pointerup', onPointerUp);
    }
}
