// Main Three.js setup, environment generation, and game loop
import { GRID_SIZE_X, GRID_SIZE_Y, GRID_SIZE_Z, BLOCK_SIZE } from './constants.js?v=22';
import { state, tanks, projectiles, particles, effects } from './state.js?v=22';
import { generateTerrain, buildTerrainMesh, getBlock, setBlock } from './terrain.js?v=22';
import { audioState, playSound, soundtrack, toggleSoundtrack, setSoundtrackVolume, startEngineHum, stopEngineHum } from './audio.js?v=22';
import { spawnTanks, applyGravityToTanks } from './tank.js?v=22';
import { setupInput, startCharging, fireProjectile } from './input.js?v=22';
import { updateWindUI, setPhase, selectTank, nextTurn, updateUI, highlightPossibleMoves, setupMultiplayerUI } from './ui.js?v=22';
import { syncActiveTankState, syncNextTurn } from './multiplayer.js?v=22';

let clock = new THREE.Clock();

// Chromatic aberration shader
const ChromaticAberrationShader = {
    uniforms: {
        tDiffuse: { value: null },
        strength: { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float strength;
        varying vec2 vUv;
        void main() {
            vec2 offset = strength * (vUv - 0.5) * 0.014;
            vec4 r = texture2D(tDiffuse, vUv - offset);
            vec4 g = texture2D(tDiffuse, vUv);
            vec4 b = texture2D(tDiffuse, vUv + offset);
            gl_FragColor = vec4(r.r, g.g, b.b, g.a);
        }
    `
};

function initThree() {
    const container = document.body;
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x020306);
    state.scene.fog = new THREE.FogExp2(0x020306, 0.007);

    state.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    state.camera.position.set(GRID_SIZE_X * BLOCK_SIZE, GRID_SIZE_Y * BLOCK_SIZE * 3.5, GRID_SIZE_Z * BLOCK_SIZE * 1.8);

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.20;
    container.appendChild(state.renderer.domElement);

    // Post-processing: UnrealBloom + Chromatic Aberration
    state.composer = new THREE.EffectComposer(state.renderer);
    const renderPass = new THREE.RenderPass(state.scene, state.camera);
    state.composer.addPass(renderPass);

    state.bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.18,  // strength
        0.22,  // radius
        0.92   // threshold — only truly emissive things bloom (shields, particles, trails)
    );
    state.composer.addPass(state.bloomPass);

    state.chromaticPass = new THREE.ShaderPass(ChromaticAberrationShader);
    state.chromaticPass.renderToScreen = true;
    state.composer.addPass(state.chromaticPass);

    state.controls = new THREE.OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    state.controls.target.set((GRID_SIZE_X * BLOCK_SIZE) / 2, (GRID_SIZE_Y * BLOCK_SIZE) / 4, (GRID_SIZE_Z * BLOCK_SIZE) / 2);

    state.controls.addEventListener('start', () => { state.cameraTransitioning = false; });

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.60);
    state.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xa5b4fc, 1.10);
    dirLight.position.set(30, 80, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 200;
    const d = 50;
    dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    state.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x06b6d4, 0.22);
    fillLight.position.set(-30, 20, -30);
    state.scene.add(fillLight);

    const floorLight = new THREE.PointLight(0x6366f1, 0.90, 90);
    floorLight.position.set((GRID_SIZE_X * BLOCK_SIZE) / 2, 2, (GRID_SIZE_Z * BLOCK_SIZE) / 2);
    state.scene.add(floorLight);

    const gridHelper = new THREE.GridHelper(GRID_SIZE_X * BLOCK_SIZE, GRID_SIZE_X, 0x6366f1, 0x1e1b4b);
    gridHelper.position.set((GRID_SIZE_X * BLOCK_SIZE) / 2 - BLOCK_SIZE / 2, -0.05, (GRID_SIZE_Z * BLOCK_SIZE) / 2 - BLOCK_SIZE / 2);
    state.scene.add(gridHelper);

    // Water plane with vertex-displacement wave shader
    const waterVert = `
        uniform float time;
        varying vec2 vUv;
        varying float vWave;
        void main() {
            vUv = uv;
            vec3 p = position;
            p.z += sin(p.x * 0.13 + time * 1.5) * 0.5
                 + sin(p.y * 0.11 + time * 1.1) * 0.4
                 + sin((p.x - p.y) * 0.09 + time * 0.85) * 0.28;
            vWave = p.z;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
    `;
    const waterFrag = `
        uniform float time;
        varying vec2 vUv;
        varying float vWave;
        void main() {
            vec3 deep    = vec3(0.02, 0.20, 0.42);
            vec3 shallow = vec3(0.04, 0.38, 0.62);
            float t = clamp((vWave + 0.85) / 1.7, 0.0, 1.0);
            vec3 col = mix(deep, shallow, t);
            float edge = smoothstep(0.0,0.12,vUv.x)*smoothstep(0.0,0.12,1.0-vUv.x)
                       * smoothstep(0.0,0.12,vUv.y)*smoothstep(0.0,0.12,1.0-vUv.y);
            gl_FragColor = vec4(col, (0.28 + t * 0.18) * edge);
        }
    `;
    state.waterMaterial = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: waterVert,
        fragmentShader: waterFrag,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const waterGeom = new THREE.PlaneGeometry(GRID_SIZE_X * BLOCK_SIZE * 2, GRID_SIZE_Z * BLOCK_SIZE * 2, 48, 48);
    state.waterPlane = new THREE.Mesh(waterGeom, state.waterMaterial);
    state.waterPlane.rotation.x = -Math.PI / 2;
    state.waterPlane.position.set((GRID_SIZE_X * BLOCK_SIZE) / 2, 0.2, (GRID_SIZE_Z * BLOCK_SIZE) / 2);
    state.scene.add(state.waterPlane);

    // Trajectory tube mesh (replaces Points)
    const trajMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    state.trajectoryMesh = new THREE.Mesh(new THREE.BufferGeometry(), trajMat);
    state.trajectoryMesh.frustumCulled = false;
    state.scene.add(state.trajectoryMesh);

    createNebulaSkybox();
}

function createNebulaSkybox() {
    // Layer 1 — dense background stars (small, mostly white/cool)
    const count1 = 2200;
    const geom1 = new THREE.BufferGeometry();
    const pos1 = new Float32Array(count1 * 3);
    const col1 = new Float32Array(count1 * 3);
    for (let i = 0; i < count1; i++) {
        const r = 190 + Math.random() * 90;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        pos1[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos1[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta)) + 15;
        pos1[i * 3 + 2] = r * Math.cos(phi);
        const rand = Math.random();
        if (rand < 0.55) { col1[i*3]=1.0; col1[i*3+1]=1.0; col1[i*3+2]=1.0; }
        else if (rand < 0.75) { col1[i*3]=0.55; col1[i*3+1]=0.8; col1[i*3+2]=1.0; }
        else if (rand < 0.88) { col1[i*3]=1.0; col1[i*3+1]=0.92; col1[i*3+2]=0.55; }
        else { col1[i*3]=0.85; col1[i*3+1]=0.55; col1[i*3+2]=1.0; }
    }
    geom1.setAttribute('position', new THREE.BufferAttribute(pos1, 3));
    geom1.setAttribute('color', new THREE.BufferAttribute(col1, 3));
    state.starfield = new THREE.Points(geom1, new THREE.PointsMaterial({
        size: 0.45, vertexColors: true, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false
    }));
    state.scene.add(state.starfield);

    // Layer 2 — bright mid-field stars (larger, more colourful)
    const count2 = 480;
    const geom2 = new THREE.BufferGeometry();
    const pos2 = new Float32Array(count2 * 3);
    const col2 = new Float32Array(count2 * 3);
    for (let i = 0; i < count2; i++) {
        const r = 145 + Math.random() * 40;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        pos2[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos2[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta)) + 10;
        pos2[i * 3 + 2] = r * Math.cos(phi);
        const rand = Math.random();
        if (rand < 0.4) { col2[i*3]=0.3; col2[i*3+1]=0.85; col2[i*3+2]=1.0; }
        else if (rand < 0.7) { col2[i*3]=0.75; col2[i*3+1]=0.3; col2[i*3+2]=1.0; }
        else { col2[i*3]=1.0; col2[i*3+1]=1.0; col2[i*3+2]=0.7; }
    }
    geom2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
    geom2.setAttribute('color', new THREE.BufferAttribute(col2, 3));
    state.nebulaClouds = new THREE.Points(geom2, new THREE.PointsMaterial({
        size: 1.1, vertexColors: true, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false
    }));
    state.scene.add(state.nebulaClouds);

    // Layer 3 — nebula cloud puffs (very large, low opacity)
    const count3 = 140;
    const geom3 = new THREE.BufferGeometry();
    const pos3 = new Float32Array(count3 * 3);
    const col3 = new Float32Array(count3 * 3);
    for (let i = 0; i < count3; i++) {
        const r = 130 + Math.random() * 30;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        pos3[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos3[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta)) + 5;
        pos3[i * 3 + 2] = r * Math.cos(phi);
        const rand = Math.random();
        if (rand < 0.5) { col3[i*3]=0.15; col3[i*3+1]=0.35; col3[i*3+2]=0.9; }
        else { col3[i*3]=0.55; col3[i*3+1]=0.1; col3[i*3+2]=0.75; }
    }
    geom3.setAttribute('position', new THREE.BufferAttribute(pos3, 3));
    geom3.setAttribute('color', new THREE.BufferAttribute(col3, 3));
    const nebulaLayer = new THREE.Points(geom3, new THREE.PointsMaterial({
        size: 5.5, vertexColors: true, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false
    }));
    state.scene.add(nebulaLayer);
    // Attach to nebulaClouds group-like via userData for rotation
    nebulaLayer.userData.rotSpeed = 0.000055;
    state.scene.userData = state.scene.userData || {};
    if (!state.scene.userData.nebulaLayers) state.scene.userData.nebulaLayers = [];
    state.scene.userData.nebulaLayers.push(nebulaLayer);

    // Horizon glow ring
    const horizonGeom = new THREE.TorusGeometry(GRID_SIZE_X * BLOCK_SIZE * 0.75, 4, 4, 72);
    const horizonMat = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    state.horizonGlow = new THREE.Mesh(horizonGeom, horizonMat);
    state.horizonGlow.position.set((GRID_SIZE_X * BLOCK_SIZE) / 2, -4, (GRID_SIZE_Z * BLOCK_SIZE) / 2);
    state.horizonGlow.rotation.x = Math.PI / 2;
    state.scene.add(state.horizonGlow);
}

function updateTrajectoryPreview() {
    if (state.currentPhase !== 'AIM' && projectiles.length === 0) {
        if (state.trajectoryMesh.geometry) state.trajectoryMesh.geometry.dispose();
        state.trajectoryMesh.geometry = new THREE.BufferGeometry();
        return;
    }
    if (!state.selectedTank && projectiles.length === 0) {
        if (state.trajectoryMesh.geometry) state.trajectoryMesh.geometry.dispose();
        state.trajectoryMesh.geometry = new THREE.BufferGeometry();
        return;
    }

    const activeProj = projectiles.length > 0 ? projectiles[0] : null;
    const mode = activeProj ? activeProj.mode : state.shotMode;

    if (mode === 'shield') {
        if (state.trajectoryMesh.geometry) state.trajectoryMesh.geometry.dispose();
        state.trajectoryMesh.geometry = new THREE.BufferGeometry();
        return;
    }

    const shooter = activeProj ? activeProj.shooter : state.selectedTank;
    const pId = shooter ? shooter.player : state.activePlayer;

    let col = 0x38bdf8;
    if (mode === 'add') col = 0x10b981;
    else if (mode === 'wall') col = (pId === 1) ? 0x10b981 : 0xf43f5e;
    state.trajectoryMesh.material.color.setHex(col);

    let startX, startY, startZ, initialVx, initialVy, initialVz;

    if (activeProj) {
        startX = activeProj.startX; startY = activeProj.startY; startZ = activeProj.startZ;
        initialVx = activeProj.initialVx; initialVy = activeProj.initialVy; initialVz = activeProj.initialVz;
    } else {
        const yaw = state.selectedTank.bodyYaw + state.selectedTank.turretYaw;
        const pitch = state.selectedTank.barrelPitch;
        const dirX = Math.sin(yaw) * Math.cos(pitch);
        const dirY = Math.sin(pitch);
        const dirZ = Math.cos(yaw) * Math.cos(pitch);
        const barrelLength = 2.0;
        startX = state.selectedTank.x * BLOCK_SIZE + dirX * barrelLength;
        startY = (state.selectedTank.y - 0.25) * BLOCK_SIZE + dirY * barrelLength;
        startZ = state.selectedTank.z * BLOCK_SIZE + dirZ * barrelLength;
        let power = 0.5;
        if (state.isCharging) {
            const elapsed = performance.now() - state.chargeStartTime;
            power = Math.min(1.0, elapsed / 1500);
        }
        const speed = 8.0 + (power * 20.0);
        initialVx = dirX * speed; initialVy = dirY * speed; initialVz = dirZ * speed;
    }

    let tx = startX, ty = startY, tz = startZ;
    let tvx = initialVx, tvy = initialVy, tvz = initialVz;
    const points = [];
    const timeStep = 0.055;
    const maxSteps = 220;

    for (let step = 0; step < maxSteps; step++) {
        points.push(new THREE.Vector3(tx, ty, tz));
        tvy -= 11.5 * timeStep;
        tvx += Math.sin(state.windDirection) * state.windSpeed * 0.08 * timeStep;
        tvz += Math.cos(state.windDirection) * state.windSpeed * 0.08 * timeStep;
        tx += tvx * timeStep; ty += tvy * timeStep; tz += tvz * timeStep;

        const gx = Math.round(tx / BLOCK_SIZE), gy = Math.round(ty / BLOCK_SIZE), gz = Math.round(tz / BLOCK_SIZE);
        if (getBlock(gx, gy, gz) > 0 || ty < 0) { points.push(new THREE.Vector3(tx, ty, tz)); break; }
        if (ty < -5 || tx < -10 || tx > GRID_SIZE_X * BLOCK_SIZE + 10 || tz < -10 || tz > GRID_SIZE_Z * BLOCK_SIZE + 10) break;
    }

    // Build TubeGeometry from trajectory arc
    if (state.trajectoryMesh.geometry) state.trajectoryMesh.geometry.dispose();
    if (points.length >= 3) {
        try {
            const curve = new THREE.CatmullRomCurve3(points);
            state.trajectoryMesh.geometry = new THREE.TubeGeometry(
                curve,
                Math.min(points.length * 2, 160),
                0.1,
                5,
                false
            );
        } catch (e) {
            state.trajectoryMesh.geometry = new THREE.BufferGeometry();
        }
    } else {
        state.trajectoryMesh.geometry = new THREE.BufferGeometry();
    }
}

function handleTankAiming(dt) {
    if (state.isMultiplayer && state.activePlayer !== state.localPlayerRole) return;
    if (!state.selectedTank || state.currentPhase !== 'AIM' || projectiles.length > 0 || state.isGameOver) return;

    const rotSpeed = 1.3;
    let changed = false;
    if (state.keysPressed['KeyA'] || state.keysPressed['ArrowLeft']) { state.selectedTank.turretYaw += rotSpeed * dt; changed = true; }
    if (state.keysPressed['KeyD'] || state.keysPressed['ArrowRight']) { state.selectedTank.turretYaw -= rotSpeed * dt; changed = true; }
    if (state.keysPressed['KeyW'] || state.keysPressed['ArrowUp']) { state.selectedTank.barrelPitch = Math.min(Math.PI / 2.1, state.selectedTank.barrelPitch + rotSpeed * dt); changed = true; }
    if (state.keysPressed['KeyS'] || state.keysPressed['ArrowDown']) { state.selectedTank.barrelPitch = Math.max(0.0, state.selectedTank.barrelPitch - rotSpeed * dt); changed = true; }

    if (changed) {
        state.selectedTank.updateMeshPosition();
        if (state.isMultiplayer) syncActiveTankState();
    }
}

function handleTankMovement(dt) {
    if (state.isMultiplayer && state.activePlayer !== state.localPlayerRole) return;
    if (!state.selectedTank || state.currentPhase !== 'MOVE' || state.isGameOver) return;

    const rotSpeed = 2.0;
    let changed = false;
    if (state.keysPressed['KeyA'] || state.keysPressed['ArrowLeft']) { state.selectedTank.bodyYaw += rotSpeed * dt; changed = true; }
    if (state.keysPressed['KeyD'] || state.keysPressed['ArrowRight']) { state.selectedTank.bodyYaw -= rotSpeed * dt; changed = true; }

    if (changed) {
        state.selectedTank.updateMeshPosition();
        highlightPossibleMoves();
        if (state.isMultiplayer) syncActiveTankState();
    }

    // Engine hum
    const isMoving = (
        state.keysPressed['KeyA'] || state.keysPressed['KeyD'] ||
        state.keysPressed['ArrowLeft'] || state.keysPressed['ArrowRight'] ||
        state.keysPressed['KeyW'] || state.keysPressed['KeyS']
    );
    if (isMoving && !state.engineHumming) {
        startEngineHum();
        state.engineHumming = true;
    } else if (!isMoving && state.engineHumming) {
        stopEngineHum();
        state.engineHumming = false;
    }
}

function updateChargePower() {
    if (state.isCharging) {
        const elapsed = performance.now() - state.chargeStartTime;
        const power = Math.min(1.0, elapsed / 1500);
        const percent = Math.round(power * 100);
        document.getElementById('power-bar').style.width = `${percent}%`;
        document.getElementById('power-percentage').innerText = `${percent}%`;
        playSound('charge', { power });
        document.getElementById('power-bar').classList.add('charging-active');
    } else {
        document.getElementById('power-bar').classList.remove('charging-active');
    }
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(0.04, clock.getDelta());
    const now = performance.now();

    // Pending animated blocks
    if (state.pendingBlocks && state.pendingBlocks.length > 0) {
        const readyBlocks = [], remainingBlocks = [];
        for (let i = 0; i < state.pendingBlocks.length; i++) {
            (state.pendingBlocks[i].targetTime <= now ? readyBlocks : remainingBlocks).push(state.pendingBlocks[i]);
        }
        if (readyBlocks.length > 0) {
            state.pendingBlocks = remainingBlocks;
            readyBlocks.forEach(b => setBlock(b.x, b.y, b.z, b.blockType));
            buildTerrainMesh();
            applyGravityToTanks();
            playSound('build_click');
        }
    }

    handleTankMovement(dt);
    handleTankAiming(dt);
    updateChargePower();
    updateTrajectoryPreview();

    // Water shader time update
    if (state.waterMaterial) {
        state.waterMaterial.uniforms.time.value = now * 0.001;
    }

    // Per-tank updates (recoil, HP bar billboard, idle bob)
    tanks.forEach(t => {
        t.update(dt);
        // Skip updateMeshPosition during victory cinematic (turret spin handles rotation directly)
        if (t === state.selectedTank && !state.victoryCinematicActive) t.updateMeshPosition();
    });

    // Active shields
    if (state.activeShields) {
        state.activeShields.forEach(shield => {
            if (shield.animating) {
                const elapsed = now - shield.animStartTime;
                const progress = Math.min(1.0, elapsed / shield.animDuration);
                const baseScale = 0.01 + progress * 0.99;
                const oscillation = Math.sin(now * 0.05) * 0.08 * (1.0 - progress + 0.25);
                const scaleScalar = Math.max(0.01, baseScale + oscillation);

                if (shield.mesh) {
                    shield.mesh.scale.set(scaleScalar, scaleScalar, scaleScalar);
                    shield.mesh.material.opacity = Math.max(0.05, Math.min(0.6, 0.1 + 0.25 * Math.sin(now * 0.04) + (Math.random() - 0.5) * 0.05));
                }
                if (shield.pointLight) {
                    const lightFlicker = Math.sin(now * 0.08) * 3.0 + (Math.random() - 0.5) * 2.0;
                    shield.pointLight.intensity = Math.max(0.5, 6.0 * (1.0 - progress) + 2.0 + lightFlicker);
                    shield.pointLight.distance = 25 + 15 * Math.sin(now * 0.02);
                }
                const ambientLight = state.scene.children.find(c => c.isAmbientLight);
                const dirLight = state.scene.children.find(c => c.isDirectionalLight);
                const globalFlicker = Math.sin(now * 0.05) * 0.25 + (Math.random() - 0.5) * 0.15;
                if (ambientLight) ambientLight.intensity = Math.max(0.1, 0.35 + globalFlicker * 1.2);
                if (dirLight) dirLight.intensity = Math.max(0.2, 1.2 + globalFlicker * 2.5);

                if (shield.textSprite) shield.textSprite.scale.set(progress * 4, progress * 4, 1);

                if (progress >= 1.0) {
                    shield.animating = false;
                    if (shield.mesh) { shield.mesh.scale.set(1, 1, 1); shield.mesh.material.opacity = 0.25; }
                    if (shield.textSprite) shield.textSprite.scale.set(4, 4, 1);
                    const al = state.scene.children.find(c => c.isAmbientLight);
                    const dl = state.scene.children.find(c => c.isDirectionalLight);
                    if (al) al.intensity = 0.25;
                    if (dl) dl.intensity = 0.65;
                }
            } else {
                if (shield.mesh && shield.mesh.material) {
                    shield.mesh.material.opacity = 0.2 + 0.08 * Math.sin(now * 0.003);
                    const s = 1 + 0.02 * Math.sin(now * 0.002);
                    shield.mesh.scale.set(s, s, s);
                }
                if (shield.pointLight) {
                    shield.pointLight.intensity = 1.0 + 0.3 * Math.sin(now * 0.002);
                    shield.pointLight.distance = 20;
                }
                if (shield.textSprite) shield.textSprite.scale.set(4, 4, 1);
            }
            if (shield.textSprite) shield.textSprite.quaternion.copy(state.camera.quaternion);
        });
    }

    // Nebula skybox rotation
    if (state.starfield) {
        state.starfield.rotation.y += 0.00008;
        state.starfield.material.opacity = 0.65 + Math.sin(now * 0.0012) * 0.22;
    }
    if (state.nebulaClouds) {
        state.nebulaClouds.rotation.y += 0.00013;
        state.nebulaClouds.material.opacity = 0.55 + Math.sin(now * 0.0009) * 0.18;
    }
    if (state.scene.userData.nebulaLayers) {
        state.scene.userData.nebulaLayers.forEach(l => { l.rotation.y += (l.userData.rotSpeed || 0.00005); });
    }
    if (state.horizonGlow) {
        state.horizonGlow.material.opacity = 0.055 + 0.03 * Math.sin(now * 0.0015);
    }

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update(dt);
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        if (!particles[i].update(dt)) particles.splice(i, 1);
    }

    // Visual effects (shockwaves, fireballs)
    for (let i = effects.length - 1; i >= 0; i--) {
        if (!effects[i].update(dt)) effects.splice(i, 1);
    }

    // Transient lights (muzzle flash, explosion flash)
    for (let i = state.transientLights.length - 1; i >= 0; i--) {
        const tl = state.transientLights[i];
        tl.elapsed += dt;
        const progress = Math.min(1.0, tl.elapsed / tl.duration);
        tl.light.intensity = (1.0 - progress) * tl.initialIntensity;
        if (tl.elapsed >= tl.duration) {
            state.scene.remove(tl.light);
            state.transientLights.splice(i, 1);
        }
    }

    // Chromatic aberration: spike on explosion, decay to zero
    if (state.chromaticTimer > 0) {
        state.chromaticTimer = Math.max(0, state.chromaticTimer - dt);
        state.chromaticPass.uniforms.strength.value = (state.chromaticTimer / 0.35) * 3.5;
    } else {
        state.chromaticPass.uniforms.strength.value = 0;
    }

    // Screen shake
    if (state.screenShakeIntensity > 0.01) {
        state.camera.position.x += (Math.random() - 0.5) * state.screenShakeIntensity;
        state.camera.position.y += (Math.random() - 0.5) * state.screenShakeIntensity;
        state.camera.position.z += (Math.random() - 0.5) * state.screenShakeIntensity;
        state.screenShakeIntensity *= 0.88;
    }

    // Impact camera zoom
    if (state.impactCameraTarget && state.impactCameraTimer > 0) {
        state.impactCameraTimer -= dt;
        state.controls.target.lerp(state.impactCameraTarget, 0.18);
        if (state.impactCameraTimer <= 0) state.impactCameraTarget = null;
    }

    // Victory cinematic: orbit camera + turret spin
    if (state.victoryCinematicActive && state.victoryCinematicTarget) {
        const vt = state.victoryCinematicTarget;
        if (vt.turretGroup) vt.turretGroup.rotation.y += dt * 1.6;

        state.victoryOrbitAngle += dt * 0.42;
        const orbitR = 20;
        const tankWorldPos = new THREE.Vector3(
            vt.x * BLOCK_SIZE,
            (vt.y - 0.5) * BLOCK_SIZE,
            vt.z * BLOCK_SIZE
        );
        state.camTargetLook.copy(tankWorldPos);
        state.camTargetPos.set(
            tankWorldPos.x + Math.sin(state.victoryOrbitAngle) * orbitR,
            tankWorldPos.y + 8,
            tankWorldPos.z + Math.cos(state.victoryOrbitAngle) * orbitR
        );
        state.cameraTransitioning = true;
    }

    // Camera lerp
    if (state.cameraLerpTarget) {
        const targetPos = new THREE.Vector3();
        state.cameraLerpTarget.getWorldPosition(targetPos);
        const offset = new THREE.Vector3(-8, 5, -8);
        state.camera.position.lerp(targetPos.clone().add(offset), 0.1);
        state.controls.target.lerp(targetPos, 0.1);
    } else if (state.cameraTransitioning) {
        state.camera.position.lerp(state.camTargetPos, 0.08);
        state.controls.target.lerp(state.camTargetLook, 0.08);
        if (state.camera.position.distanceTo(state.camTargetPos) < 0.15 &&
            state.controls.target.distanceTo(state.camTargetLook) < 0.15) {
            state.cameraTransitioning = false;
        }
    }

    state.controls.update();
    state.composer.render();
}

window.addEventListener('resize', () => {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    if (state.composer) state.composer.setSize(window.innerWidth, window.innerHeight);
    if (state.bloomPass) state.bloomPass.resolution.set(window.innerWidth, window.innerHeight);
});

function setupUIEventListeners() {
    const btnPhaseAction = document.getElementById('btn-phase-action');
    if (btnPhaseAction) {
        btnPhaseAction.addEventListener('click', () => {
            if (state.currentPhase === 'MOVE') { playSound('click'); setPhase('AIM'); }
        });
    }

    const btnSkipTurn = document.getElementById('btn-skip-turn');
    if (btnSkipTurn) {
        btnSkipTurn.addEventListener('click', () => {
            playSound('click');
            if (state.isMultiplayer) { const nextRole = state.activePlayer === 1 ? 2 : 1; syncNextTurn(nextRole); }
            else nextTurn();
        });
    }

    const btnToggleSfx = document.getElementById('btn-toggle-sfx');
    if (btnToggleSfx) {
        btnToggleSfx.addEventListener('click', (e) => {
            audioState.isSfxEnabled = !audioState.isSfxEnabled;
            const icon = e.currentTarget.querySelector('i');
            icon.className = audioState.isSfxEnabled ? "fa-solid fa-volume-high text-indigo-400" : "fa-solid fa-volume-xmark text-slate-500";
            playSound('click');
        });
    }

    const btnToggleMode = document.getElementById('btn-toggle-mode');
    if (btnToggleMode) {
        btnToggleMode.addEventListener('click', () => {
            playSound('click');
            if (state.shotMode === 'sub') state.shotMode = 'add';
            else if (state.shotMode === 'add') state.shotMode = 'wall';
            else if (state.shotMode === 'wall') {
                if (!state.shieldCharges) state.shieldCharges = { 1: 1, 2: 1 };
                state.shotMode = state.shieldCharges[state.activePlayer] > 0 ? 'shield' : 'sub';
            } else {
                state.shotMode = 'sub';
            }
            updateUI();
            updateTrajectoryPreview();
        });
    }

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
        volSlider.addEventListener('input', (e) => setSoundtrackVolume(parseFloat(e.target.value)));
    }

    const btnStartGame = document.getElementById('btn-start-game');
    if (btnStartGame) {
        btnStartGame.addEventListener('click', () => {
            playSound('click');
            const intro = document.getElementById('intro-modal');
            if (intro) intro.classList.add('opacity-0', 'pointer-events-none');
        });
    }

    document.querySelectorAll('.panel-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const panel = btn.closest('.panel-collapsible');
            if (panel) { panel.classList.toggle('collapsed'); playSound('click'); }
        });
    });

    setupMultiplayerUI();
}

function startApp() {
    initThree();
    generateTerrain();
    buildTerrainMesh();
    spawnTanks();
    setupInput();
    updateWindUI();
    setupUIEventListeners();

    if (tanks.length > 0) { selectTank(tanks[0]); setPhase('SELECT'); }
    animate();
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    startApp();
} else {
    window.addEventListener('load', startApp);
}
