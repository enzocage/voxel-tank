// Tank model generation, positioning, health, and gravity
import { BLOCK_SIZE } from './constants.js?v=6';
import { state, tanks } from './state.js?v=6';
import { getSurfaceY } from './terrain.js?v=6';
import { playSound } from './audio.js?v=6';
import { spawnDamageParticles, spawnExplosion } from './particles.js?v=6';
import { updateUI, checkVictory, showAnnouncement } from './ui.js?v=6';

export class Tank {
    constructor(id, player, x, z, color, name) {
        this.id = id;
        this.player = player;
        this.x = x;
        this.z = z;
        this.y = getSurfaceY(x, z);
        this.color = color;
        this.name = name;
        this.hp = 100;
        this.maxHp = 100;
        this.bodyYaw = player === 1 ? 0 : Math.PI; 
        this.turretYaw = 0; 
        this.barrelPitch = 0.3; 
        this.mesh = new THREE.Group();
        this.turretGroup = new THREE.Group();
        this.barrelMesh = null;
        this.hpBarGroup = null;

        this.buildVoxelMesh();
        this.createHealthBar();
        this.updateMeshPosition();
        state.scene.add(this.mesh);
    }

    buildVoxelMesh() {
        const group = this.mesh;
        
        const trackGeom = new THREE.BoxGeometry(0.5, 0.45, 1.9);
        const trackMat = new THREE.MeshStandardMaterial({ 
            color: 0x1e293b, 
            roughness: 0.9,
            emissive: this.player === 1 ? 0x064e3b : 0x4c0519,
            emissiveIntensity: 0.3
        });
        
        const trackL = new THREE.Mesh(trackGeom, trackMat);
        trackL.position.set(-0.75, 0.225, 0);
        trackL.castShadow = true;
        group.add(trackL);

        const trackR = trackL.clone();
        trackR.position.x = 0.75;
        group.add(trackR);

        const chassisGeom = new THREE.BoxGeometry(1.2, 0.55, 1.7);
        const chassisMat = new THREE.MeshStandardMaterial({ 
            color: this.color, 
            roughness: 0.4, 
            metalness: 0.3 
        });
        const chassis = new THREE.Mesh(chassisGeom, chassisMat);
        chassis.position.set(0, 0.45, 0);
        chassis.castShadow = true;
        chassis.receiveShadow = true;
        group.add(chassis);

        const plateGeom = new THREE.BoxGeometry(0.12, 0.35, 1.3);
        const plateMat = new THREE.MeshStandardMaterial({ 
            color: 0x0f172a, 
            roughness: 0.2, 
            emissive: this.player === 1 ? 0x10b981 : 0xf43f5e, 
            emissiveIntensity: 0.6 
        });
        const plateL = new THREE.Mesh(plateGeom, plateMat);
        plateL.position.set(-0.62, 0.45, 0);
        group.add(plateL);
        
        const plateR = plateL.clone();
        plateR.position.x = 0.62;
        group.add(plateR);

        const turretGeom = new THREE.BoxGeometry(0.85, 0.45, 0.85);
        const turret = new THREE.Mesh(turretGeom, chassisMat);
        turret.position.set(0, 0.225, 0);
        turret.castShadow = true;
        this.turretGroup.add(turret);

        const barrelGeom = new THREE.BoxGeometry(0.18, 0.18, 1.4);
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.2 });
        this.barrelMesh = new THREE.Mesh(barrelGeom, barrelMat);
        this.barrelMesh.position.set(0, 0, 0.6); 
        
        const barrelPivot = new THREE.Group();
        barrelPivot.position.set(0, 0.22, 0);
        barrelPivot.add(this.barrelMesh);
        this.turretGroup.add(barrelPivot);

        this.turretGroup.position.set(0, 0.725, -0.1);
        group.add(this.turretGroup);

        const ringGeom = new THREE.RingGeometry(1.0, 1.12, 24);
        ringGeom.rotateX(-Math.PI/2);
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: this.player === 1 ? 0x10b981 : 0xf43f5e, 
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        this.ringMesh = new THREE.Mesh(ringGeom, ringMat);
        this.ringMesh.position.y = 0.03;
        group.add(this.ringMesh);
    }

    createHealthBar() {
        this.hpBarGroup = new THREE.Group();
        
        const bgGeom = new THREE.PlaneGeometry(1.4, 0.15);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x991b1b, side: THREE.DoubleSide });
        const bg = new THREE.Mesh(bgGeom, bgMat);
        this.hpBarGroup.add(bg);

        const fgGeom = new THREE.PlaneGeometry(1.4, 0.15);
        const fgMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide });
        this.hpBarFg = new THREE.Mesh(fgGeom, fgMat);
        this.hpBarFg.position.z = 0.01; 
        this.hpBarGroup.add(this.hpBarFg);

        this.hpBarGroup.position.set(0, 2.2, 0);
        this.mesh.add(this.hpBarGroup);
    }

    updateMeshPosition() {
        const targetX = this.x * BLOCK_SIZE;
        const targetY = (this.y - 0.5) * BLOCK_SIZE; 
        const targetZ = this.z * BLOCK_SIZE;

        this.mesh.position.set(targetX, targetY, targetZ);
        this.mesh.rotation.y = this.bodyYaw;
        
        this.turretGroup.rotation.y = this.turretYaw;
        if (this.turretGroup.children[1]) {
            this.turretGroup.children[1].rotation.x = -this.barrelPitch;
        }

        if (state.selectedTank === this) {
            this.ringMesh.scale.set(1.1 + Math.sin(performance.now() * 0.008) * 0.1, 1.1 + Math.sin(performance.now() * 0.008) * 0.1, 1);
            this.ringMesh.material.opacity = 0.9;
        } else {
            this.ringMesh.scale.set(1, 1, 1);
            this.ringMesh.material.opacity = 0.4;
        }
    }

    updateHealthBar() {
        const hpPercent = this.hp / this.maxHp;
        this.hpBarFg.scale.x = hpPercent;
        this.hpBarFg.position.x = -0.7 * (1 - hpPercent);

        if (hpPercent < 0.35) {
            this.hpBarFg.material.color.setHex(0xf43f5e); 
        } else {
            this.hpBarFg.material.color.setHex(0x10b981); 
        }
    }

    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
        this.updateHealthBar();
        updateUI();
        
        spawnDamageParticles(this.x * BLOCK_SIZE, this.y * BLOCK_SIZE, this.z * BLOCK_SIZE, this.color);

        if (this.hp <= 0) {
            this.destroy();
        }
    }

    destroy() {
        spawnExplosion(this.mesh.position, this.color, 50);
        playSound('explosion');
        state.scene.remove(this.mesh);
        
        const index = tanks.indexOf(this);
        if (index > -1) {
            tanks.splice(index, 1);
        }
        
        checkVictory();
        updateUI();
    }
}

export function spawnTanks() {
    const p1Names = ["CYBER-ZEUS", "GRID-STALKER", "NEON-TITAN", "APEX-P1", "VOID-RAIDER"];
    const p1Positions = [
        {x: 2, z: 4}, {x: 4, z: 10}, {x: 3, z: 16}, {x: 4, z: 22}, {x: 2, z: 28}
    ];

    const p2Names = ["DOOM-BRINGER", "MAGMA-REAPER", "HELL-HOUND", "NIGHT-STALKER", "OMEGA-P2"];
    const p2Positions = [
        {x: 29, z: 4}, {x: 27, z: 10}, {x: 28, z: 16}, {x: 27, z: 22}, {x: 29, z: 28}
    ];

    p1Positions.forEach((pos, i) => {
        tanks.push(new Tank(i + 1, 1, pos.x, pos.z, 0x10b981, p1Names[i]));
    });

    p2Positions.forEach((pos, i) => {
        tanks.push(new Tank(10 + i + 1, 2, pos.x, pos.z, 0xf43f5e, p2Names[i]));
    });
}

export function applyGravityToTanks() {
    tanks.forEach(tank => {
        const surfaceY = getSurfaceY(tank.x, tank.z);
        if (tank.y !== surfaceY) {
            if (tank.y > surfaceY) {
                const fallDistance = tank.y - surfaceY;
                tank.y = surfaceY;
                if (fallDistance >= 2) {
                    const dmg = Math.round(fallDistance * 14);
                    tank.takeDamage(dmg);
                    showAnnouncement(`${tank.name} stürzt ab: -${dmg} HP!`);
                }
            } else {
                tank.y = surfaceY;
            }
            tank.updateMeshPosition();
        }
    });
}
