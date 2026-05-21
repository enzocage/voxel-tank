// Particle systems (dust, sparks, explosions, trails)
import { state, particles } from './state.js?v=21';

export class Particle {
    constructor(x, y, z, color, size, velocity, life) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.vx = velocity.x;
        this.vy = velocity.y;
        this.vz = velocity.z;
        this.color = color;
        this.maxLife = life;
        this.life = life;

        const geom = new THREE.BoxGeometry(size, size, size);
        
        const mat = new THREE.MeshStandardMaterial({ 
            color: color,
            transparent: true,
            opacity: 1.0,
            emissive: color,
            emissiveIntensity: 0.8
        });
        
        this.mesh = new THREE.Mesh(geom, mat);
        this.mesh.position.set(x, y, z);
        state.scene.add(this.mesh);
    }

    update(dt) {
        this.life -= dt;
        this.vy -= 9.81 * dt; 

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;

        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.material.opacity = Math.max(0, this.life / this.maxLife);

        this.mesh.rotation.x += this.vx * 0.15;
        this.mesh.rotation.y += this.vy * 0.15;

        if (this.life <= 0) {
            state.scene.remove(this.mesh);
            return false;
        }
        return true;
    }
}

export function spawnDebrisParticle(x, y, z, color) {
    const size = 0.25 + Math.random() * 0.45;
    const life = 1.2 + Math.random() * 0.8;
    const velocity = {
        x: (Math.random() - 0.5) * 11,
        y: (Math.random() * 10) + 4,
        z: (Math.random() - 0.5) * 11
    };
    particles.push(new Particle(x, y, z, color, size, velocity, life));
}

export function spawnTrailParticle(x, y, z) {
    const size = 0.2;
    const life = 0.45;
    const velocity = { x: (Math.random()-0.5)*1, y: 0.3, z: (Math.random()-0.5)*1 };
    particles.push(new Particle(x, y, z, 0x06b6d4, size, velocity, life));
}

export function spawnDamageParticles(x, y, z, color) {
    for (let i = 0; i < 20; i++) {
        const size = 0.15 + Math.random() * 0.3;
        const life = 0.6 + Math.random() * 0.6;
        const velocity = {
            x: (Math.random() - 0.5) * 7,
            y: (Math.random() * 7) + 3,
            z: (Math.random() - 0.5) * 7
        };
        particles.push(new Particle(x, y, z, color, size, velocity, life));
    }
}

export function spawnExplosion(pos, color, count) {
    for (let i = 0; i < count; i++) {
        const size = 0.18 + Math.random() * 0.55;
        const life = 0.9 + Math.random() * 0.9;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        
        const speed = 4 + Math.random() * 10;
        const velocity = {
            x: Math.sin(phi) * Math.cos(theta) * speed,
            y: Math.abs(Math.sin(phi) * Math.sin(theta) * speed) + 3,
            z: Math.cos(phi) * speed
        };

        const particleColor = Math.random() < 0.5 ? color : 0xf59e0b; 
        particles.push(new Particle(pos.x, pos.y, pos.z, particleColor, size, velocity, life));
    }
}

export function spawnHitParticles(x, y, z, color) {
    // 1. Spawns standard debris/damage particles
    spawnDamageParticles(x, y, z, color);
    
    // 2. Add some high-energy glowing sparks (white, gold/orange, and neon player color)
    const colors = [0xffffff, 0xffb703, color];
    for (let i = 0; i < 20; i++) {
        const size = 0.08 + Math.random() * 0.12;
        const life = 0.4 + Math.random() * 0.4;
        const sparkColor = colors[Math.floor(Math.random() * colors.length)];
        const velocity = {
            x: (Math.random() - 0.5) * 12,
            y: (Math.random() * 9) + 4,
            z: (Math.random() - 0.5) * 12
        };
        particles.push(new Particle(x, y, z, sparkColor, size, velocity, life));
    }
}
