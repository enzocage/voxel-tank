// AI opponent for player 2 — tactical strategy state machine
import { BLOCK_SIZE, GRID_SIZE_X, GRID_SIZE_Z } from './constants.js?v=23';
import { state, tanks } from './state.js?v=23';
import { getSurfaceY } from './terrain.js?v=23';
import { playSound } from './audio.js?v=23';
import {
    setPhase, selectTank, nextTurn, updateUI,
    deployShield, showAnnouncement,
    adjustCameraFocusOnTank, highlightPossibleMoves, clearHighlights
} from './ui.js?v=23';
import { fireProjectile } from './input.js?v=23';

// ─── Strategy state ───────────────────────────────────────────────────────────

const aiState = {
    phase: 'SETUP_SHIELD',
    turnCount: 0,
    shieldDeployedAtTurn: null,
    shieldedTankIds: [],
    walledTankIds: [],
    attackShieldIndex: 0,
    attackWallIndex: 0,
};

export function initAI() {
    aiState.phase = 'SETUP_SHIELD';
    aiState.turnCount = 0;
    aiState.shieldDeployedAtTurn = null;
    aiState.shieldedTankIds = [];
    aiState.walledTankIds = [];
    aiState.attackShieldIndex = 0;
    aiState.attackWallIndex = 0;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAITanks() {
    return tanks.filter(t => t.player === 2 && t.hp > 0).sort((a, b) => a.z - b.z);
}

function getEnemyTanks() {
    return tanks.filter(t => t.player === 1 && t.hp > 0);
}

function canReachTarget(shooter, target) {
    const gravity = 11.5, maxSpeed = 28;
    const dx = (target.x - shooter.x) * BLOCK_SIZE;
    const dy = (target.y - shooter.y) * BLOCK_SIZE;
    const dz = (target.z - shooter.z) * BLOCK_SIZE;
    const hdist = Math.sqrt(dx * dx + dz * dz);
    const maxRange = (maxSpeed * maxSpeed) / gravity;
    if (hdist > maxRange) return false;
    // Minimum range check (can't shoot point-blank on self)
    if (hdist < 2) return false;
    // Check if pitch solution exists: hdist*tan(p) - g*hdist²/(2v²cos²p) = dy
    // At 45°: max range = v²/g. For elevated targets, reduce check tolerance.
    const a = gravity * hdist * hdist / (2 * maxSpeed * maxSpeed);
    return (hdist - dy) >= a;
}

function findReachableEnemies(shooter) {
    return getEnemyTanks()
        .filter(t => canReachTarget(shooter, t))
        .sort((a, b) => a.hp - b.hp);
}

// ─── Ballistic aiming ─────────────────────────────────────────────────────────

function calculateBallisticShot(shooter, target) {
    const gravity = 11.5;
    const sx = shooter.x * BLOCK_SIZE, sy = shooter.y * BLOCK_SIZE, sz = shooter.z * BLOCK_SIZE;
    const tx = target.x * BLOCK_SIZE,  ty = target.y * BLOCK_SIZE,  tz = target.z * BLOCK_SIZE;
    const dx = tx - sx, dy = ty - sy, dz = tz - sz;

    const windX = Math.sin(state.windDirection) * state.windSpeed * 0.4;
    const windZ = Math.cos(state.windDirection) * state.windSpeed * 0.4;

    // Iterative wind compensation (3 passes)
    let aimDx = dx, aimDz = dz;
    for (let iter = 0; iter < 3; iter++) {
        const hdist = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
        const T = hdist > 0 ? hdist / 28 : 0.1;
        aimDx = dx - 0.5 * windX * T * T;
        aimDz = dz - 0.5 * windZ * T * T;
    }

    const hdist = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
    const absoluteYaw = Math.atan2(aimDx, aimDz);
    const speed = 28;

    // Binary search for pitch angle
    let lo = 0.01, hi = Math.PI / 2 - 0.01;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const cosP = Math.cos(mid);
        if (cosP < 1e-6) { hi = mid; continue; }
        const T = hdist / (speed * cosP);
        const predictedDy = speed * Math.sin(mid) * T - 0.5 * gravity * T * T;
        if (predictedDy > dy) hi = mid;
        else lo = mid;
    }
    const barrelPitch = (lo + hi) / 2;
    const turretYaw = absoluteYaw - shooter.bodyYaw;

    return { turretYaw, barrelPitch, speed };
}

// ─── Direct tank movement (bypasses isLocalTurn check) ───────────────────────

function aiDoStep(dx, dz) {
    if (!state.selectedTank || state.actionsRemaining <= 0) return false;

    const nx = state.selectedTank.x + dx;
    const nz = state.selectedTank.z + dz;

    if (nx < 0 || nx >= GRID_SIZE_X || nz < 0 || nz >= GRID_SIZE_Z) return false;

    const isOccupied = tanks.some(t => t.x === nx && t.z === nz);
    if (isOccupied) return false;

    const targetY = getSurfaceY(nx, nz);
    const currentY = state.selectedTank.y;
    if (targetY <= 0 || Math.abs(targetY - currentY) > 1) return false;

    state.selectedTank.x = nx;
    state.selectedTank.z = nz;
    state.selectedTank.y = targetY;
    state.actionsRemaining--;

    playSound('move');
    state.selectedTank.updateMeshPosition();
    adjustCameraFocusOnTank(state.selectedTank);
    highlightPossibleMoves();
    updateUI();

    return true;
}

function aiMoveTowardTarget(tank, targetX, targetZ, callback) {
    // Build list of steps needed
    const steps = [];
    let cx = tank.x, cz = tank.z;
    const maxSteps = state.actionsRemaining;

    for (let s = 0; s < maxSteps; s++) {
        if (cx === targetX && cz === targetZ) break;
        const remX = targetX - cx;
        const remZ = targetZ - cz;

        let dx = 0, dz = 0;
        if (Math.abs(remX) >= Math.abs(remZ) && remX !== 0) {
            dx = Math.sign(remX);
        } else if (remZ !== 0) {
            dz = Math.sign(remZ);
        } else if (remX !== 0) {
            dx = Math.sign(remX);
        }

        if (dx === 0 && dz === 0) break;
        steps.push({ dx, dz });
        cx += dx;
        cz += dz;
    }

    let stepIndex = 0;

    function executeNext() {
        if (stepIndex >= steps.length || state.actionsRemaining <= 0) {
            if (callback) callback();
            return;
        }
        const { dx, dz } = steps[stepIndex++];
        // Try primary direction; if blocked try the other axis
        if (!aiDoStep(dx, dz)) {
            // Try alternate axis
            if (dx !== 0 && !aiDoStep(0, Math.sign(targetZ - tank.z) || 1)) {
                if (callback) callback();
                return;
            } else if (dz !== 0 && !aiDoStep(Math.sign(targetX - tank.x) || -1, 0)) {
                if (callback) callback();
                return;
            }
        }
        setTimeout(executeNext, 300);
    }

    executeNext();
}

// ─── Fire helpers ─────────────────────────────────────────────────────────────

function aiFirePerfectShot(shooter, target) {
    const aim = calculateBallisticShot(shooter, target);
    shooter.turretYaw = aim.turretYaw;
    shooter.barrelPitch = Math.max(0.05, Math.min(aim.barrelPitch, Math.PI / 2 - 0.05));
    shooter.updateMeshPosition();
    state.shotMode = 'sub';
    state.chargeStartTime = performance.now() - 1500;
    fireProjectile();
}

function aiBuildWallShot(shooter) {
    // Aim in -x direction (toward player 1 side)
    const absoluteYaw = Math.atan2(-1, 0); // = -π/2, fires in -x direction
    shooter.turretYaw = absoluteYaw - shooter.bodyYaw;
    shooter.barrelPitch = 0.30;
    shooter.updateMeshPosition();
    state.shotMode = 'wall';
    state.chargeStartTime = performance.now() - 900; // medium power
    fireProjectile();
}

function aiFireShield(shooter) {
    state.shotMode = 'shield';
    // fireProjectile() in shield mode uses selectedTank.mesh.position directly
    state.chargeStartTime = performance.now() - 1500;
    fireProjectile();
}

function executeAttack(shooter, target) {
    selectTank(shooter);
    setPhase('MOVE');
    setTimeout(() => {
        setPhase('AIM');
        setTimeout(() => {
            aiFirePerfectShot(shooter, target);
        }, 600);
    }, 500);
}

// ─── Main turn entry ──────────────────────────────────────────────────────────

export function aiTakeTurn() {
    if (state.isGameOver || state.activePlayer !== 2) return;

    aiState.turnCount++;

    // Shield renewal check: takes priority after 10 turns since last deploy
    if (
        aiState.shieldDeployedAtTurn !== null &&
        aiState.turnCount - aiState.shieldDeployedAtTurn >= 10 &&
        aiState.phase !== 'SETUP_SHIELD' &&
        aiState.phase !== 'BUILD_WALL_1' &&
        aiState.phase !== 'BUILD_WALL_2' &&
        aiState.phase !== 'RENEW_SHIELD'
    ) {
        aiState.phase = 'RENEW_SHIELD';
    }

    showAnnouncement('KI analysiert Schlachtfeld...');

    switch (aiState.phase) {
        case 'SETUP_SHIELD':  aiDoSetupShield(); break;
        case 'BUILD_WALL_1':  aiBuildWall('T4'); break;
        case 'BUILD_WALL_2':  aiBuildWall('T5'); break;
        case 'ATTACK_SHIELD': aiAttackFromShield(); break;
        case 'ATTACK_WALLS':  aiAttackFromWalls(); break;
        case 'RENEW_SHIELD':  aiRenewShield(); break;
        case 'ADVANCE':       aiAdvanceAndShoot(); break;
        default:              aiAttackFromShield(); break;
    }
}

// ─── Strategy phases ─────────────────────────────────────────────────────────

function aiDoSetupShield() {
    const ai = getAITanks();
    if (ai.length < 2) {
        aiState.phase = 'ATTACK_SHIELD';
        setTimeout(() => aiTakeTurn(), 500);
        return;
    }

    // T1 = ai[0] (lowest z = outermost), T2 = ai[1], T3 = ai[2]
    const T1 = ai[0];
    const T2 = ai[1];
    const T3 = ai.length > 2 ? ai[2] : ai[1];

    // Move T1 to midpoint between T2 and T3 (same x as T2, z midpoint)
    const targetX = T2.x;
    const targetZ = Math.round((T2.z + T3.z) / 2);

    selectTank(T1);
    setPhase('MOVE');

    aiMoveTowardTarget(T1, targetX, targetZ, () => {
        setTimeout(() => {
            setPhase('AIM');
            setTimeout(() => {
                // Record shielded tanks before deploying (T1 is now at new position)
                aiState.shieldedTankIds = [T1.id, T2.id, T3.id];
                aiState.walledTankIds = ai.slice(3).map(t => t.id);
                aiState.shieldDeployedAtTurn = aiState.turnCount;
                aiState.phase = 'BUILD_WALL_1';

                aiFireShield(T1);
            }, 600);
        }, 500);
    });
}

function aiBuildWall(slot) {
    const ai = getAITanks();
    // T4 = ai[3], T5 = ai[4] (higher z values, unshielded)
    const tank = slot === 'T4' ? ai[3] : ai[4];

    if (!tank) {
        aiState.phase = slot === 'T4' ? 'BUILD_WALL_2' : 'ATTACK_SHIELD';
        setTimeout(() => aiTakeTurn(), 500);
        return;
    }

    selectTank(tank);
    setPhase('MOVE');

    // Move 2 steps toward enemy (decrease x) to position closer to wall landing
    let stepsDone = 0;
    function doStep() {
        if (stepsDone < 2 && state.actionsRemaining > 0) {
            aiDoStep(-1, 0);
            stepsDone++;
            setTimeout(doStep, 300);
        } else {
            setTimeout(() => {
                setPhase('AIM');
                setTimeout(() => {
                    aiBuildWallShot(tank);
                    aiState.phase = slot === 'T4' ? 'BUILD_WALL_2' : 'ATTACK_SHIELD';
                }, 600);
            }, 400);
        }
    }
    doStep();
}

function aiAttackFromShield() {
    const shielded = tanks.filter(t => t.player === 2 && t.hp > 0 && aiState.shieldedTankIds.includes(t.id));

    if (shielded.length === 0) {
        aiState.phase = 'ATTACK_WALLS';
        setTimeout(() => aiTakeTurn(), 500);
        return;
    }

    // Rotate through shielded tanks
    const idx = aiState.attackShieldIndex % shielded.length;
    const shooter = shielded[idx];
    aiState.attackShieldIndex++;

    let reachable = findReachableEnemies(shooter);

    // If current tank can't reach anyone, try others in the shielded group
    if (reachable.length === 0) {
        for (const t of shielded) {
            reachable = findReachableEnemies(t);
            if (reachable.length > 0) {
                executeAttack(t, reachable[0]);
                return;
            }
        }
        // No shielded tank can reach anyone
        aiState.phase = 'ATTACK_WALLS';
        setTimeout(() => aiTakeTurn(), 500);
        return;
    }

    executeAttack(shooter, reachable[0]);
}

function aiAttackFromWalls() {
    const walled = tanks.filter(t => t.player === 2 && t.hp > 0 && aiState.walledTankIds.includes(t.id));

    if (walled.length === 0) {
        // Fall back to any alive AI tank
        const anyAlive = getAITanks();
        if (anyAlive.length === 0) return;
        for (const t of anyAlive) {
            const r = findReachableEnemies(t);
            if (r.length > 0) { executeAttack(t, r[0]); return; }
        }
        aiState.phase = 'ADVANCE';
        setTimeout(() => aiTakeTurn(), 500);
        return;
    }

    const tank = walled[aiState.attackWallIndex % walled.length];
    aiState.attackWallIndex++;

    let reachable = findReachableEnemies(tank);

    if (reachable.length === 0) {
        for (const t of walled) {
            reachable = findReachableEnemies(t);
            if (reachable.length > 0) { executeAttack(t, reachable[0]); return; }
        }
        aiState.phase = 'ADVANCE';
        setTimeout(() => aiTakeTurn(), 500);
        return;
    }

    executeAttack(tank, reachable[0]);
}

function aiRenewShield() {
    const prev = tanks.filter(t => t.player === 2 && t.hp > 0 && aiState.shieldedTankIds.includes(t.id));

    if (prev.length === 0) {
        aiState.phase = 'ADVANCE';
        setTimeout(() => aiTakeTurn(), 500);
        return;
    }

    // Deploy from middle of surviving shielded tanks
    prev.sort((a, b) => a.z - b.z);
    const middleTank = prev[Math.floor(prev.length / 2)];

    // Restore shield charge for the AI
    state.shieldCharges[2] = 1;

    selectTank(middleTank);
    setPhase('MOVE');

    setTimeout(() => {
        setPhase('AIM');
        setTimeout(() => {
            aiState.shieldDeployedAtTurn = aiState.turnCount;
            aiState.phase = 'ATTACK_SHIELD';
            aiFireShield(middleTank);
        }, 600);
    }, 500);
}

function aiAdvanceAndShoot() {
    const alive = getAITanks();
    const enemies = getEnemyTanks();

    if (enemies.length === 0 || alive.length === 0) return;

    // First: check if any tank can already reach an enemy → shoot immediately
    for (const tank of alive) {
        const reachable = findReachableEnemies(tank);
        if (reachable.length > 0) {
            executeAttack(tank, reachable[0]);
            return;
        }
    }

    // No tank can reach anyone → move the first tank toward nearest enemy
    const mover = alive[0];
    const nearest = enemies.slice().sort((a, b) => {
        const da = Math.abs(a.x - mover.x) + Math.abs(a.z - mover.z);
        const db = Math.abs(b.x - mover.x) + Math.abs(b.z - mover.z);
        return da - db;
    })[0];

    // Target 6 grid cells away in x from the enemy
    const targetX = nearest.x + 6;
    const targetZ = nearest.z;

    selectTank(mover);
    setPhase('MOVE');

    aiMoveTowardTarget(mover, targetX, targetZ, () => {
        setTimeout(() => {
            const reachable = findReachableEnemies(mover);
            if (reachable.length > 0) {
                setPhase('AIM');
                setTimeout(() => aiFirePerfectShot(mover, reachable[0]), 600);
            } else {
                // Skip this turn, stay in ADVANCE phase
                setPhase('AIM');
                setTimeout(() => nextTurn(), 600);
            }
        }, 400);
    });
}
