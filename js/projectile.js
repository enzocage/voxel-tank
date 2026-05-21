// Projectile logic, movement, and terrain destruction
import { BLOCK_SIZE, GRID_SIZE_X, GRID_SIZE_Y, GRID_SIZE_Z, PALETTE } from './constants.js?v=17';
import { state, projectiles, tanks } from './state.js?v=17';
import { getBlock, setBlock, buildTerrainMesh, getSurfaceY } from './terrain.js?v=17';
import { playSound } from './audio.js?v=17';
import { spawnExplosion, spawnDebrisParticle, spawnTrailParticle } from './particles.js?v=17';
import { applyGravityToTanks } from './tank.js?v=17';
import { nextTurn, showAnnouncement, deployShield } from './ui.js?v=17';

export class Projectile {
    constructor(startX, startY, startZ, velocity, shooterTank) {
        this.x = startX;
        this.y = startY;
        this.z = startZ;
        this.vx = velocity.x;
        this.vy = velocity.y;
        this.vz = velocity.z;
        this.shooter = shooterTank;
        this.mode = state.shotMode;
        
        // Save initial parameters for trajectory preview during flight
        this.startX = startX;
        this.startY = startY;
        this.startZ = startZ;
        this.initialVx = velocity.x;
        this.initialVy = velocity.y;
        this.initialVz = velocity.z;
        
        const isAddMode = this.mode === 'add';
        const isWallMode = this.mode === 'wall';
        const isShieldMode = this.mode === 'shield';
        const shooterId = shooterTank ? shooterTank.player : state.activePlayer;
        const playerColor = (shooterId === 1) ? 0x10b981 : 0xf43f5e;
        const projColor = isAddMode ? 0x10b981 : (isWallMode ? playerColor : (isShieldMode ? playerColor : 0x38bdf8));
        const lightColor = isAddMode ? 0x10b981 : (isWallMode ? playerColor : (isShieldMode ? playerColor : 0x06b6d4));

        const geom = new THREE.SphereGeometry(0.35, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: projColor });
        this.mesh = new THREE.Mesh(geom, mat);
        this.mesh.position.set(startX, startY, startZ);
        
        this.light = new THREE.PointLight(lightColor, 1.5, 12);
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

        const windForceX = Math.sin(state.windDirection) * state.windSpeed * 0.08;
        const windForceZ = Math.cos(state.windDirection) * state.windSpeed * 0.08;
        
        this.vx += windForceX * dt;
        this.vz += windForceZ * dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;

        this.mesh.position.set(this.x, this.y, this.z);

        if (Math.random() < 0.6) {
            spawnTrailParticle(this.x, this.y, this.z);
        }

        if (this.y < -5 || this.x < -10 || this.x > GRID_SIZE_X * BLOCK_SIZE + 10 || this.z < -10 || this.z > GRID_SIZE_Z * BLOCK_SIZE + 10) {
            this.destroy();
            return false;
        }

        // Check shield dome collisions
        if (state.activeShields) {
            for (const shield of state.activeShields) {
                // If shooter was inside this shield, the projectile can pass out of it
                const shooterPos = this.shooter ? new THREE.Vector3(this.shooter.x * BLOCK_SIZE, this.shooter.y * BLOCK_SIZE, this.shooter.z * BLOCK_SIZE) : null;
                const shooterInside = shooterPos ? (shooterPos.distanceTo(shield.center) <= shield.radius) : false;
                
                if (shooterInside) {
                    continue; // Ignore this shield
                }

                // Check if projectile is inside the shield boundary
                const projPos = new THREE.Vector3(this.x, this.y, this.z);
                const distToCenter = projPos.distanceTo(shield.center);
                if (distToCenter <= shield.radius) {
                    // Collision! Explode at current position
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
            
            if (tank === this.shooter && this.mesh.position.distanceTo(new THREE.Vector3(this.shooter.x * BLOCK_SIZE, this.shooter.y * BLOCK_SIZE, this.shooter.z * BLOCK_SIZE)) < 3.2) {
                continue;
            }

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
        state.scene.remove(this.mesh);
        state.cameraLerpTarget = null;
        const idx = projectiles.indexOf(this);
        if (idx > -1) projectiles.splice(idx, 1);
        
        setTimeout(() => {
            applyGravityToTanks();
            nextTurn();
        }, 800);
    }

    explode(ex, ey, ez) {
        const gx = Math.round(ex / BLOCK_SIZE);
        const gy = Math.round(ey / BLOCK_SIZE);
        const gz = Math.round(ez / BLOCK_SIZE);
        
        console.log("Projectile explode. Shot Mode:", this.mode, "Impact Voxel:", gx, gy, gz);

        if (this.mode === 'shield') {
            deployShield(ex, ey, ez, this.shooter ? this.shooter.player : state.activePlayer);
            this.destroy();
            return;
        }

        if (this.mode === 'add') {
            playSound('add_deploy');
            state.screenShakeIntensity = 0.4;

            const addRadius = 4.8;
            const blockType = 4; // Lebendige Energiekristalle (Smaragd-Grün)

            const blocksToPlace = [];
            const startTime = performance.now();

            for (let dx = -5; dx <= 5; dx++) {
                for (let dy = -5; dy <= 5; dy++) {
                    for (let dz = -5; dz <= 5; dz++) {
                        const tx = gx + dx;
                        const ty = gy + dy;
                        const tz = gz + dz;

                        if (tx >= 0 && tx < GRID_SIZE_X && ty >= 0 && ty < GRID_SIZE_Y && tz >= 0 && tz < GRID_SIZE_Z) {
                            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                            if (dist <= addRadius) {
                                if (getBlock(tx, ty, tz) === 0) {
                                    blocksToPlace.push({
                                        x: tx,
                                        y: ty,
                                        z: tz,
                                        dist: dist
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Sort by distance from center (ascending) so it grows radially outward
            blocksToPlace.sort((a, b) => a.dist - b.dist);

            if (!state.pendingBlocks) state.pendingBlocks = [];
            
            blocksToPlace.forEach(b => {
                const delay = b.dist * 80; // Outward radial delay (max ~384ms)
                state.pendingBlocks.push({
                    x: b.x,
                    y: b.y,
                    z: b.z,
                    blockType: blockType,
                    targetTime: startTime + delay
                });
            });

            spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x10b981, 35);
            this.destroy();
            return;
        }

        if (this.mode === 'wall') {
            playSound('wall_deploy');
            state.screenShakeIntensity = 0.5;

            // 1. Calculate orthogonal vector snap
            let dxVec = 0;
            let dzVec = 0;
            const vx = this.vx;
            const vz = this.vz;

            if (Math.abs(vx) > Math.abs(vz)) {
                dzVec = 1; // Orthogonal to X is Z
            } else {
                dxVec = 1; // Orthogonal to Z is X
            }

            const wallCoords = [];
            const playerId = this.shooter ? this.shooter.player : state.activePlayer;
            const wallLength = 10;
            const wallHeight = 5;
            const blockType = (playerId === 1) ? 7 : 8; // 7 for Player 1, 8 for Player 2

            // 2. Queue the wall blocks centered on the impact coordinate gx, gz
            const startTime = performance.now();
            if (!state.pendingBlocks) state.pendingBlocks = [];

            for (let i = -5; i <= 4; i++) {
                const tx = gx + dxVec * i;
                const tz = gz + dzVec * i;

                if (tx >= 0 && tx < GRID_SIZE_X && tz >= 0 && tz < GRID_SIZE_Z) {
                    const startY = getSurfaceY(tx, tz);
                    for (let dy = 0; dy < wallHeight; dy++) {
                        const ty = startY + dy;
                        if (ty < GRID_SIZE_Y) {
                            wallCoords.push({ x: tx, y: ty, z: tz });
                            
                            const colDist = Math.abs(i);
                            const delay = colDist * 50 + dy * 15; // Outward sweeping + rising delay
                            
                            state.pendingBlocks.push({
                                x: tx,
                                y: ty,
                                z: tz,
                                blockType: blockType,
                                targetTime: startTime + delay
                            });
                        }
                    }
                }
            }

            // 3. Keep track of wall counts per player and replace the oldest if over 3
            if (!state.playerWalls) {
                state.playerWalls = { 1: [], 2: [] };
            }
            if (state.playerWalls[playerId].length >= 3) {
                const oldestWall = state.playerWalls[playerId].shift();
                oldestWall.forEach(coord => {
                    // Only clear it if it's still a wall block
                    const blockVal = getBlock(coord.x, coord.y, coord.z);
                    if (blockVal === 7 || blockVal === 8) {
                        setBlock(coord.x, coord.y, coord.z, 0);
                    }
                });
                buildTerrainMesh();
                applyGravityToTanks();
                showAnnouncement(`Spieler ${playerId}: Älteste Wand entfernt (max. 3 Wände)!`);
            }
            state.playerWalls[playerId].push(wallCoords);

            spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x8b5cf6, 35);
            this.destroy();
            return;
        }

        playSound('explosion');
        
        state.screenShakeIntensity = 1.3;

        const destroyRadius = 2.8;

        for (let dx = -3; dx <= 3; dx++) {
            for (let dy = -3; dy <= 3; dy++) {
                for (let dz = -3; dz <= 3; dz++) {
                    const tx = gx + dx;
                    const ty = gy + dy;
                    const tz = gz + dz;

                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    if (dist <= destroyRadius) {
                        const type = getBlock(tx, ty, tz);
                        if (type > 0) {
                            spawnDebrisParticle(tx * BLOCK_SIZE, ty * BLOCK_SIZE, tz * BLOCK_SIZE, PALETTE[type]);
                            
                            if (type === 7 || type === 8) {
                                // Wall block is particularly hard: it has a high chance (70%) to downgrade to burnt ash (type 6) or resist, instead of being destroyed
                                if (Math.random() < 0.7) {
                                    setBlock(tx, ty, tz, 6);
                                }
                            } else {
                                if (dist > destroyRadius - 0.7 && Math.random() < 0.6) {
                                    setBlock(tx, ty, tz, 6); 
                                } else {
                                    setBlock(tx, ty, tz, 0); 
                                }
                            }
                        }
                    }
                }
            }
        }

        buildTerrainMesh();

        tanks.forEach(tank => {
            const tankWorldPos = new THREE.Vector3(tank.x * BLOCK_SIZE, (tank.y - 0.5) * BLOCK_SIZE, tank.z * BLOCK_SIZE);
            
            // Check if tank is protected by any active shield dome
            let isProtected = false;
            if (state.activeShields) {
                for (const shield of state.activeShields) {
                    const distToShield = tankWorldPos.distanceTo(shield.center);
                    if (distToShield <= shield.radius) {
                        isProtected = true;
                        break;
                    }
                }
            }

            if (isProtected) {
                console.log(`${tank.name} is protected inside a shield dome!`);
                return; // Ignore damage
            }

            const distToExplosion = tankWorldPos.distanceTo(new THREE.Vector3(ex, ey, ez));
            
            const maxDmgDist = 8.5; 
            if (distToExplosion < maxDmgDist) {
                const damage = Math.round((1 - (distToExplosion / maxDmgDist)) * 65);
                if (damage > 0) {
                    tank.takeDamage(damage);
                    showAnnouncement(`${tank.name} nimmt ${damage} Schaden!`);
                }
            }
        });

        spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x38bdf8, 30); 
        this.destroy();
    }
}
