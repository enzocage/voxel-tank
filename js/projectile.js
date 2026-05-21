// Projectile logic, movement, and terrain destruction
import { BLOCK_SIZE, GRID_SIZE_X, GRID_SIZE_Y, GRID_SIZE_Z, PALETTE } from './constants.js?v=23';
import { state, projectiles, tanks } from './state.js?v=23';
import { getBlock, setBlock, buildTerrainMesh, getSurfaceY } from './terrain.js?v=23';
import { playSound } from './audio.js?v=23';
import { spawnExplosion, spawnDebrisParticle, spawnTrailParticle, spawnShockwave, spawnFireball } from './particles.js?v=23';
import { applyGravityToTanks } from './tank.js?v=23';
import { nextTurn, showAnnouncement, deployShield } from './ui.js?v=23';
import { syncBlockChanges } from './multiplayer.js?v=23';

export class Projectile {
    constructor(startX, startY, startZ, velocity, shooterTankOrMode, optionalTank = null) {
        this.x = startX; this.y = startY; this.z = startZ;
        this.vx = velocity.x; this.vy = velocity.y; this.vz = velocity.z;

        if (typeof shooterTankOrMode === 'string') {
            this.mode = shooterTankOrMode;
            this.shooter = optionalTank;
        } else {
            this.shooter = shooterTankOrMode;
            this.mode = state.shotMode;
        }

        this.isRemoteSimulation = false;

        this.startX = startX; this.startY = startY; this.startZ = startZ;
        this.initialVx = velocity.x; this.initialVy = velocity.y; this.initialVz = velocity.z;

        const isAddMode = this.mode === 'add';
        const isWallMode = this.mode === 'wall';
        const isShieldMode = this.mode === 'shield';
        const shooterId = this.shooter ? this.shooter.player : state.activePlayer;
        const playerColor = (shooterId === 1) ? 0x10b981 : 0xf43f5e;
        const projColor = isAddMode ? 0x10b981 : (isWallMode ? playerColor : (isShieldMode ? playerColor : 0x38bdf8));
        const lightColor = isAddMode ? 0x10b981 : (isWallMode ? playerColor : (isShieldMode ? playerColor : 0x06b6d4));

        const geom = new THREE.SphereGeometry(0.35, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: projColor });
        this.mesh = new THREE.Mesh(geom, mat);
        this.mesh.position.set(startX, startY, startZ);

        // Projectile glow light (enhanced)
        this.light = new THREE.PointLight(lightColor, 2.5, 16);
        this.mesh.add(this.light);

        state.scene.add(this.mesh);

        if (state.useActionCam) {
            state.cameraLerpTarget = this.mesh;
            state.cameraTransitioning = false;
        }
    }

    update(dt) {
        const gravity = 11.5;
        this.vy -= gravity * dt;

        const windForceX = Math.sin(state.windDirection) * state.windSpeed * 0.4;
        const windForceZ = Math.cos(state.windDirection) * state.windSpeed * 0.4;
        this.vx += windForceX * dt;
        this.vz += windForceZ * dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;

        this.mesh.position.set(this.x, this.y, this.z);

        // Projectile spin
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
        this.mesh.rotation.x += dt * speed * 0.4;
        this.mesh.rotation.z += dt * speed * 0.3;

        if (Math.random() < 0.6) spawnTrailParticle(this.x, this.y, this.z);

        if (this.y < -5 || this.x < -10 || this.x > GRID_SIZE_X * BLOCK_SIZE + 10 || this.z < -10 || this.z > GRID_SIZE_Z * BLOCK_SIZE + 10) {
            this.destroy();
            return false;
        }

        // Shield dome collisions
        if (state.activeShields) {
            for (const shield of state.activeShields) {
                const shooterPos = this.shooter ? new THREE.Vector3(this.shooter.x * BLOCK_SIZE, this.shooter.y * BLOCK_SIZE, this.shooter.z * BLOCK_SIZE) : null;
                const shooterInside = shooterPos ? (shooterPos.distanceTo(shield.center) <= shield.radius) : false;
                if (shooterInside) continue;

                const projPos = new THREE.Vector3(this.x, this.y, this.z);
                if (projPos.distanceTo(shield.center) <= shield.radius) {
                    // Shield block sound
                    const mapCenterX = GRID_SIZE_X * BLOCK_SIZE / 2;
                    const pan = Math.max(-1, Math.min(1, (this.x - mapCenterX) / (GRID_SIZE_X * BLOCK_SIZE / 2)));
                    playSound('shield_block', { pan });
                    this.explode(this.x, this.y, this.z);
                    return false;
                }
            }
        }

        const gridX = Math.round(this.x / BLOCK_SIZE);
        const gridY = Math.round(this.y / BLOCK_SIZE);
        const gridZ = Math.round(this.z / BLOCK_SIZE);

        if (getBlock(gridX, gridY, gridZ) > 0) {
            this.explode(this.x, this.y, this.z);
            return false;
        }

        for (let i = 0; i < tanks.length; i++) {
            const tank = tanks[i];
            if (tank === this.shooter && this.mesh.position.distanceTo(new THREE.Vector3(this.shooter.x * BLOCK_SIZE, this.shooter.y * BLOCK_SIZE, this.shooter.z * BLOCK_SIZE)) < 3.2) continue;

            const dx = Math.abs(this.x - tank.x * BLOCK_SIZE);
            const dy = Math.abs(this.y - (tank.y - 0.5) * BLOCK_SIZE);
            const dz = Math.abs(this.z - tank.z * BLOCK_SIZE);
            if (dx < 1.4 && dy < 1.0 && dz < 1.4) {
                this.explode(this.x, this.y, this.z);
                return false;
            }
        }

        return true;
    }

    destroy() {
        console.log('[CAM] Projectile.destroy | isRemote:', this.isRemoteSimulation, '| cameraTransitioning before:', state.cameraTransitioning);
        state.scene.remove(this.mesh);
        state.cameraLerpTarget = null;
        const idx = projectiles.indexOf(this);
        if (idx > -1) projectiles.splice(idx, 1);

        if (this.isRemoteSimulation) return;

        setTimeout(() => {
            applyGravityToTanks();
            if (state.isMultiplayer) {
                const nextRole = (state.localPlayerRole === 1) ? 2 : 1;
                import('./multiplayer.js?v=23').then(mp => { mp.syncNextTurn(nextRole); }).catch(err => console.error('[CAM] syncNextTurn failed:', err));
            } else {
                nextTurn();
            }
        }, 800);
    }

    explode(ex, ey, ez) {
        const gx = Math.round(ex / BLOCK_SIZE);
        const gy = Math.round(ey / BLOCK_SIZE);
        const gz = Math.round(ez / BLOCK_SIZE);

        if (this.isRemoteSimulation) {
            if (this.mode === 'add') spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x10b981, 35);
            else if (this.mode === 'wall') spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x8b5cf6, 35);
            else if (this.mode !== 'shield') spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x38bdf8, 30);
            
            // Set impact camera target for spectators to follow the remote impact smoothly
            state.impactCameraTarget = new THREE.Vector3(ex, ey, ez);
            state.impactCameraTimer = 0.75;

            this.destroy();
            return;
        }

        if (this.mode === 'shield') {
            deployShield(ex, ey, ez, this.shooter ? this.shooter.player : state.activePlayer);
            this.destroy();
            return;
        }

        // Explosion flash light
        const flashColor = this.mode === 'add' ? 0x10ff88 : (this.mode === 'wall' ? 0x8b5cf6 : 0xff6020);
        const flashLight = new THREE.PointLight(flashColor, 12, 32);
        flashLight.position.set(ex, ey, ez);
        state.scene.add(flashLight);
        state.transientLights.push({ light: flashLight, duration: 0.28, elapsed: 0, initialIntensity: 12 });

        // Impact camera target
        state.impactCameraTarget = new THREE.Vector3(ex, ey, ez);
        state.impactCameraTimer = 0.75;

        if (this.mode === 'add') {
            playSound('add_deploy');
            state.screenShakeIntensity = 0.4;

            const addRadius = 4.8;
            const blockType = 4;
            const blocksToPlace = [];
            const startTime = performance.now();

            for (let dx = -5; dx <= 5; dx++) {
                for (let dy = -5; dy <= 5; dy++) {
                    for (let dz = -5; dz <= 5; dz++) {
                        const tx = gx + dx, ty = gy + dy, tz = gz + dz;
                        if (tx >= 0 && tx < GRID_SIZE_X && ty >= 0 && ty < GRID_SIZE_Y && tz >= 0 && tz < GRID_SIZE_Z) {
                            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                            if (dist <= addRadius && getBlock(tx, ty, tz) === 0) {
                                blocksToPlace.push({ x: tx, y: ty, z: tz, dist });
                            }
                        }
                    }
                }
            }
            blocksToPlace.sort((a, b) => a.dist - b.dist);
            if (!state.pendingBlocks) state.pendingBlocks = [];
            blocksToPlace.forEach(b => {
                state.pendingBlocks.push({ x: b.x, y: b.y, z: b.z, blockType, targetTime: startTime + b.dist * 80 });
            });
            if (state.isMultiplayer) {
                syncBlockChanges(blocksToPlace.map(b => ({ x: b.x, y: b.y, z: b.z, type: blockType, delay: Math.round(b.dist * 80) })), [], 'add_deploy');
            }
            spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x10b981, 35);
            spawnFireball(ex, ey, ez, 0x10ff88);
            spawnShockwave(ex, ey, ez, 0x10b981);
            this.destroy();
            return;
        }

        if (this.mode === 'wall') {
            playSound('wall_deploy');
            state.screenShakeIntensity = 0.5;

            let dxVec = 0, dzVec = 0;
            if (Math.abs(this.vx) > Math.abs(this.vz)) dzVec = 1;
            else dxVec = 1;

            const wallCoords = [];
            const playerId = this.shooter ? this.shooter.player : state.activePlayer;
            const wallHeight = 5;
            const blockType = (playerId === 1) ? 7 : 8;
            const startTime = performance.now();
            if (!state.pendingBlocks) state.pendingBlocks = [];

            for (let i = -5; i <= 4; i++) {
                const tx = gx + dxVec * i, tz = gz + dzVec * i;
                if (tx >= 0 && tx < GRID_SIZE_X && tz >= 0 && tz < GRID_SIZE_Z) {
                    const startY = getSurfaceY(tx, tz);
                    for (let dy = 0; dy < wallHeight; dy++) {
                        const ty = startY + dy;
                        if (ty < GRID_SIZE_Y) {
                            const delay = Math.round(Math.abs(i) * 50 + dy * 15);
                            wallCoords.push({ x: tx, y: ty, z: tz, delay });
                            state.pendingBlocks.push({ x: tx, y: ty, z: tz, blockType, targetTime: startTime + delay });
                        }
                    }
                }
            }

            if (!state.playerWalls) state.playerWalls = { 1: [], 2: [] };
            if (state.playerWalls[playerId].length >= 3) {
                const oldestWall = state.playerWalls[playerId].shift();
                let clearedBlocks = [];
                oldestWall.forEach(coord => {
                    const blockVal = getBlock(coord.x, coord.y, coord.z);
                    if (blockVal === 7 || blockVal === 8) {
                        setBlock(coord.x, coord.y, coord.z, 0);
                        clearedBlocks.push({ x: coord.x, y: coord.y, z: coord.z, type: 0, delay: 0 });
                    }
                });
                buildTerrainMesh();
                applyGravityToTanks();
                showAnnouncement(`Spieler ${playerId}: Älteste Wand entfernt (max. 3 Wände)!`);
                if (state.isMultiplayer && clearedBlocks.length > 0) syncBlockChanges(clearedBlocks, [], null);
            }
            state.playerWalls[playerId].push(wallCoords);
            if (state.isMultiplayer) {
                syncBlockChanges(wallCoords.map(c => ({ x: c.x, y: c.y, z: c.z, type: blockType, delay: c.delay })), [], 'wall_deploy');
            }
            spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x8b5cf6, 35);
            spawnFireball(ex, ey, ez, 0x8b5cf6);
            this.destroy();
            return;
        }

        // SUB explosion
        const mapCenterX = GRID_SIZE_X * BLOCK_SIZE / 2;
        const pan = Math.max(-1, Math.min(1, (ex - mapCenterX) / (GRID_SIZE_X * BLOCK_SIZE / 2)));
        playSound('explosion', { pan });
        state.screenShakeIntensity = 1.3;

        // Chromatic aberration spike
        state.chromaticTimer = 0.35;

        const destroyRadius = 2.8;
        const blocksChanged = [];

        for (let dx = -3; dx <= 3; dx++) {
            for (let dy = -3; dy <= 3; dy++) {
                for (let dz = -3; dz <= 3; dz++) {
                    const tx = gx + dx, ty = gy + dy, tz = gz + dz;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist <= destroyRadius) {
                        const type = getBlock(tx, ty, tz);
                        if (type > 0) {
                            spawnDebrisParticle(tx * BLOCK_SIZE, ty * BLOCK_SIZE, tz * BLOCK_SIZE, PALETTE[type]);
                            if (type === 7 || type === 8) {
                                if (Math.random() < 0.7) { setBlock(tx, ty, tz, 6); blocksChanged.push({ x: tx, y: ty, z: tz, type: 6 }); }
                            } else if (dist > destroyRadius - 0.7 && Math.random() < 0.6) {
                                setBlock(tx, ty, tz, 6); blocksChanged.push({ x: tx, y: ty, z: tz, type: 6 });
                            } else {
                                setBlock(tx, ty, tz, 0); blocksChanged.push({ x: tx, y: ty, z: tz, type: 0 });
                            }
                        }
                    }
                }
            }
        }

        buildTerrainMesh();

        const damageList = [];
        tanks.forEach(tank => {
            const tankWorldPos = new THREE.Vector3(tank.x * BLOCK_SIZE, (tank.y - 0.5) * BLOCK_SIZE, tank.z * BLOCK_SIZE);
            let isProtected = false;
            if (state.activeShields) {
                for (const shield of state.activeShields) {
                    if (tankWorldPos.distanceTo(shield.center) <= shield.radius) { isProtected = true; break; }
                }
            }
            if (isProtected) return;

            const distToExplosion = tankWorldPos.distanceTo(new THREE.Vector3(ex, ey, ez));
            const maxDmgDist = 8.5;
            if (distToExplosion < maxDmgDist) {
                const damage = Math.round((1 - (distToExplosion / maxDmgDist)) * 65);
                if (damage > 0) {
                    tank.takeDamage(damage);
                    showAnnouncement(`${tank.name} nimmt ${damage} Schaden!`);
                    damageList.push({ id: tank.id, hp: tank.hp });
                }
            }
        });

        if (state.isMultiplayer) syncBlockChanges(blocksChanged, damageList, 'explosion');

        spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x38bdf8, 30);
        spawnShockwave(ex, ey, ez, 0x38bdf8);
        spawnFireball(ex, ey, ez, 0xff6020);
        this.destroy();
    }
}
