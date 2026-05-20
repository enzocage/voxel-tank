// Main Three.js setup, environment generation, and game loop
import { GRID_SIZE_X, GRID_SIZE_Y, GRID_SIZE_Z, BLOCK_SIZE } from './constants.js';
import { state, tanks, projectiles, particles } from './state.js';
import { generateTerrain, buildTerrainMesh, getBlock } from './terrain.js';
import { audioState, playSound, soundtrack, toggleSoundtrack, setSoundtrackVolume } from './audio.js';
import { spawnTanks } from './tank.js';
import { setupInput, startCharging, fireProjectile } from './input.js';
import { updateWindUI, setPhase, selectTank, nextTurn, updateUI } from './ui.js';

let clock = new THREE.Clock();

function initThree() {
    const container = document.body;
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x020306);
    state.scene.fog = new THREE.FogExp2(0x020306, 0.008);

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    state.camera.position.set(GRID_SIZE_X * BLOCK_SIZE, GRID_SIZE_Y * BLOCK_SIZE * 3.5, GRID_SIZE_Z * BLOCK_SIZE * 1.8);

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(state.renderer.domElement);

    state.controls = new THREE.OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    state.controls.target.set((GRID_SIZE_X * BLOCK_SIZE) / 2, (GRID_SIZE_Y * BLOCK_SIZE) / 4, (GRID_SIZE_Z * BLOCK_SIZE) / 2);

    state.controls.addEventListener('start', () => {
        state.cameraTransitioning = false;
    });

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    state.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xa5b4fc, 1.2);
    dirLight.position.set(30, 80, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    const d = 50;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    state.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x06b6d4, 0.6);
    fillLight.position.set(-30, 20, -30);
    state.scene.add(fillLight);

    const floorLight = new THREE.PointLight(0x6366f1, 2.5, 120);
    floorLight.position.set((GRID_SIZE_X * BLOCK_SIZE) / 2, 2, (GRID_SIZE_Z * BLOCK_SIZE) / 2);
    state.scene.add(floorLight);

    const gridHelper = new THREE.GridHelper(GRID_SIZE_X * BLOCK_SIZE, GRID_SIZE_X, 0x6366f1, 0x1e1b4b);
    gridHelper.position.set((GRID_SIZE_X * BLOCK_SIZE)/2 - BLOCK_SIZE/2, -0.05, (GRID_SIZE_Z * BLOCK_SIZE)/2 - BLOCK_SIZE/2);
    state.scene.add(gridHelper);

    const waterGeom = new THREE.PlaneGeometry(GRID_SIZE_X * BLOCK_SIZE * 2, GRID_SIZE_Z * BLOCK_SIZE * 2);
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x063970,
        roughness: 0.1,
        metalness: 0.8,
        transparent: true,
        opacity: 0.4,
        emissive: 0x0c4a6e,
        emissiveIntensity: 0.3
    });
    state.waterPlane = new THREE.Mesh(waterGeom, waterMat);
    state.waterPlane.rotation.x = -Math.PI / 2;
    state.waterPlane.position.set((GRID_SIZE_X * BLOCK_SIZE)/2, 0.2, (GRID_SIZE_Z * BLOCK_SIZE)/2);
    state.scene.add(state.waterPlane);

    const trajGeom = new THREE.BufferGeometry();
    const trajMat = new THREE.PointsMaterial({
        color: 0x38bdf8,
        size: 0.35,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    state.trajectoryMesh = new THREE.Points(trajGeom, trajMat);
    state.scene.add(state.trajectoryMesh);

    createStarfield();
}

function createStarfield() {
    const starCount = 1800;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
        const r = 160 + Math.random() * 100;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);

        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta)) + 10; 
        positions[i * 3 + 2] = r * Math.cos(phi);

        const rand = Math.random();
        if (rand < 0.6) {
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 1.0;
            colors[i * 3 + 2] = 1.0;
        } else if (rand < 0.85) {
            colors[i * 3] = 0.5;
            colors[i * 3 + 1] = 0.85;
            colors[i * 3 + 2] = 1.0;
        } else {
            colors[i * 3] = 0.9;
            colors[i * 3 + 1] = 0.6;
            colors[i * 3 + 2] = 1.0;
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    state.starfield = new THREE.Points(geometry, material);
    state.scene.add(state.starfield);
}

function updateTrajectoryPreview() {
    if (!state.selectedTank || state.currentPhase !== 'AIM' || projectiles.length > 0) {
        state.trajectoryMesh.geometry.setFromPoints([]);
        return;
    }

    const yaw = state.selectedTank.turretYaw;
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
    let power = 0.5; 
    if (state.isCharging) {
        const elapsed = performance.now() - state.chargeStartTime;
        power = Math.min(1.0, elapsed / 1500);
    }
    const speed = minSpeed + (power * (maxSpeed - minSpeed));

    let tempX = startX;
    let tempY = startY;
    let tempZ = startZ;
    let tempVx = dirX * speed;
    let tempVy = dirY * speed;
    let tempVz = dirZ * speed;

    const points = [];
    const timeStep = 0.05;
    const maxSteps = 60; 

    for (let step = 0; step < maxSteps; step++) {
        points.push(new THREE.Vector3(tempX, tempY, tempZ));

        tempVy -= 11.5 * timeStep;

        const windForceX = Math.sin(state.windDirection) * state.windSpeed * 0.08;
        const windForceZ = Math.cos(state.windDirection) * state.windSpeed * 0.08;
        tempVx += windForceX * timeStep;
        tempVz += windForceZ * timeStep;

        tempX += tempVx * timeStep;
        tempY += tempVy * timeStep;
        tempZ += tempVz * timeStep;

        const gridX = Math.round(tempX / BLOCK_SIZE);
        const gridY = Math.round(tempY / BLOCK_SIZE);
        const gridZ = Math.round(tempZ / BLOCK_SIZE);

        if (getBlock(gridX, gridY, gridZ) > 0 || tempY < 0) {
            points.push(new THREE.Vector3(tempX, tempY, tempZ));
            break;
        }
    }

    state.trajectoryMesh.geometry.setFromPoints(points);
}

function handleTankAiming(dt) {
    if (!state.selectedTank || state.currentPhase !== 'AIM' || projectiles.length > 0 || state.isGameOver) return;

    const rotSpeed = 1.3; 
    let changed = false;

    if (state.keysPressed['KeyA'] || state.keysPressed['ArrowLeft']) {
        state.selectedTank.turretYaw += rotSpeed * dt;
        changed = true;
    }
    if (state.keysPressed['KeyD'] || state.keysPressed['ArrowRight']) {
        state.selectedTank.turretYaw -= rotSpeed * dt;
        changed = true;
    }

    if (state.keysPressed['KeyW'] || state.keysPressed['ArrowUp']) {
        state.selectedTank.barrelPitch = Math.min(Math.PI / 2.1, state.selectedTank.barrelPitch + rotSpeed * dt);
        changed = true;
    }
    if (state.keysPressed['KeyS'] || state.keysPressed['ArrowDown']) {
        state.selectedTank.barrelPitch = Math.max(0.0, state.selectedTank.barrelPitch - rotSpeed * dt);
        changed = true;
    }

    if (changed) {
        state.selectedTank.updateMeshPosition();
    }
}

function updateChargePower() {
    if (state.isCharging) {
        const elapsed = performance.now() - state.chargeStartTime;
        const power = Math.min(1.0, elapsed / 1500);

        const percent = Math.round(power * 100);
        document.getElementById('power-bar').style.width = `${percent}%`;
        document.getElementById('power-percentage').innerText = `${percent}%`;
        
        playSound('charge', { power: power });

        document.getElementById('power-bar').classList.add('charging-active');
    } else {
        document.getElementById('power-bar').classList.remove('charging-active');
    }
}

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(0.04, clock.getDelta()); 

    handleTankAiming(dt);
    updateChargePower();
    updateTrajectoryPreview();

    if (state.waterPlane) {
        state.waterPlane.material.emissiveIntensity = 0.2 + Math.sin(performance.now() * 0.002) * 0.15;
    }

    tanks.forEach(t => {
        if (t.hpBarGroup) {
            t.hpBarGroup.quaternion.copy(state.camera.quaternion);
        }
    });

    if (state.starfield) {
        state.starfield.rotation.y += 0.0001; 
        state.starfield.material.opacity = 0.65 + Math.sin(performance.now() * 0.0012) * 0.25;
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const active = projectiles[i].update(dt);
        if (!active) {}
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const active = particles[i].update(dt);
        if (!active) {
            particles.splice(i, 1);
        }
    }

    if (state.screenShakeIntensity > 0.01) {
        state.camera.position.x += (Math.random() - 0.5) * state.screenShakeIntensity;
        state.camera.position.y += (Math.random() - 0.5) * state.screenShakeIntensity;
        state.camera.position.z += (Math.random() - 0.5) * state.screenShakeIntensity;
        state.screenShakeIntensity *= 0.88; 
    }

    if (state.cameraLerpTarget) {
        const targetPos = new THREE.Vector3();
        state.cameraLerpTarget.getWorldPosition(targetPos);
        
        const offset = new THREE.Vector3(-8, 5, -8);
        const desiredCamPos = targetPos.clone().add(offset);
        
        state.camera.position.lerp(desiredCamPos, 0.1);
        state.controls.target.lerp(targetPos, 0.1);
    } 
    else if (state.cameraTransitioning) {
        state.camera.position.lerp(state.camTargetPos, 0.08);
        state.controls.target.lerp(state.camTargetLook, 0.08);

        if (state.camera.position.distanceTo(state.camTargetPos) < 0.15 && state.controls.target.distanceTo(state.camTargetLook) < 0.15) {
            state.cameraTransitioning = false;
        }
    }

    state.controls.update();
    state.renderer.render(state.scene, state.camera);
}

window.addEventListener('resize', () => {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('btn-phase-action').addEventListener('click', () => {
    if (state.currentPhase === 'MOVE') {
        playSound('click');
        setPhase('AIM');
    }
});

document.getElementById('btn-skip-turn').addEventListener('click', () => {
    playSound('click');
    nextTurn();
});

document.getElementById('btn-toggle-sfx').addEventListener('click', (e) => {
    audioState.isSfxEnabled = !audioState.isSfxEnabled;
    const icon = e.currentTarget.querySelector('i');
    if (audioState.isSfxEnabled) {
        icon.className = "fa-solid fa-volume-high text-indigo-400";
    } else {
        icon.className = "fa-solid fa-volume-xmark text-slate-500";
    }
    playSound('click');
});

const playBtn = document.getElementById('btn-play-soundtrack');
const volSlider = document.getElementById('slider-soundtrack-vol');
if (playBtn && volSlider) {
    playBtn.addEventListener('click', () => {
        toggleSoundtrack();
        const playIcon = playBtn.querySelector('i');
        if (audioState.isSoundtrackPlaying) {
            playIcon.className = "fa-solid fa-pause text-[8px]";
            playBtn.classList.remove('animate-pulse');
        } else {
            playIcon.className = "fa-solid fa-play text-[8px]";
            playBtn.classList.add('animate-pulse');
        }
        playSound('click');
    });

    volSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        setSoundtrackVolume(val);
    });
}

document.getElementById('btn-start-game').addEventListener('click', () => {
    playSound('click');
    const intro = document.getElementById('intro-modal');
    intro.classList.add('opacity-0', 'pointer-events-none');
    
    toggleSoundtrack();
    if (playBtn) {
        const playIcon = playBtn.querySelector('i');
        if (playIcon) playIcon.className = "fa-solid fa-pause text-[8px]";
        playBtn.classList.remove('animate-pulse');
    }
});

window.onload = function () {
    initThree();
    generateTerrain();
    buildTerrainMesh();
    spawnTanks();
    setupInput();
    updateWindUI();
    
    if (tanks.length > 0) {
        selectTank(tanks[0]);
        setPhase('SELECT');
    }

    animate();
}
