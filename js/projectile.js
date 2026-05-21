// Projectile logic, movement, and terrain destruction
import { BLOCK_SIZE, GRID_SIZE_X, GRID_SIZE_Z, PALETTE } from './constants.js?v=4';
import { state, projectiles, tanks } from './state.js?v=4';
import { getBlock, setBlock, buildTerrainMesh } from './terrain.js?v=4';
import { playSound } from './audio.js?v=4';
import { spawnExplosion, spawnDebrisParticle, spawnTrailParticle } from './particles.js?v=4';
import { applyGravityToTanks } from './tank.js?v=4';
import { nextTurn, showAnnouncement } from './ui.js?v=4';

export class Projectile {
    constructor(startX, startY, startZ, velocity, shooterTank) {
        this.x = startX;
        this.y = startY;
        this.z = startZ;
        this.vx = velocity.x;
        this.vy = velocity.y;
        this.vz = velocity.z;
        this.shooter = shooterTank;
        
        const isAddMode = state.shotMode === 'add';
        const projColor = isAddMode ? 0x10b981 : 0x38bdf8;
        const lightColor = isAddMode ? 0x10b981 : 0x06b6d4;

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
        
        console.log("Projectile explode. Shot Mode:", state.shotMode, "Impact Voxel:", gx, gy, gz);

        if (state.shotMode === 'add') {
            playSound('charge');
            state.screenShakeIntensity = 0.4;

            const addRadius = 2.4;
            const blockType = 4; // Lebendige Energiekristalle (Smaragd-Grün)

            for (let dx = -3; dx <= 3; dx++) {
                for (let dy = -3; dy <= 3; dy++) {
                    for (let dz = -3; dz <= 3; dz++) {
                        const tx = gx + dx;
                        const ty = gy + dy;
                        const tz = gz + dz;

                        if (tx >= 0 && tx < GRID_SIZE_X && ty >= 0 && ty < GRID_SIZE_Y && tz >= 0 && tz < GRID_SIZE_Z) {
                            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                            if (dist <= addRadius) {
                                if (getBlock(tx, ty, tz) === 0) {
                                    setBlock(tx, ty, tz, blockType);
                                }
                            }
                        }
                    }
                }
            }

            buildTerrainMesh();
            applyGravityToTanks();

            spawnExplosion(new THREE.Vector3(ex, ey, ez), 0x10b981, 35);
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

        buildTerrainMesh();

        tanks.forEach(tank => {
            const tankWorldPos = new THREE.Vector3(tank.x * BLOCK_SIZE, (tank.y - 0.5) * BLOCK_SIZE, tank.z * BLOCK_SIZE);
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
