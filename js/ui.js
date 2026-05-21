// UI layouts, banner displays, updates, wind direction display, victory check, and selections
import { BLOCK_SIZE, GRID_SIZE_X, GRID_SIZE_Z, getCardinalDirectionFromYaw } from './constants.js?v=23';
import { state, tanks, movementHighlights, projectiles, particles } from './state.js?v=23';
import { getSurfaceY, generateTerrain, buildTerrainMesh } from './terrain.js?v=23';
import { playSound } from './audio.js?v=23';
import { spawnTanks } from './tank.js?v=23';
import { initAuth, registerWithEmail, loginWithEmail, loginAnonymouslyAsGuest, logoutUser, getLeaderboard, recordMatchResult } from './auth.js?v=23';
import { createLobby, joinLobby, leaveLobby, syncSelectedTank, syncPhase, syncActiveTankState } from './multiplayer.js?v=23';
import { isPlaceholder } from './firebase-config.js?v=23';

export function showAnnouncement(text) {
    const container = document.getElementById('announcement-text');
    container.innerText = text;
    container.style.opacity = '1';
    
    setTimeout(() => {
        if (container.innerText === text) {
            container.style.opacity = '0';
        }
    }, 3000);
}

export function adjustCameraFocusOnTank(tank) {
    state.cameraLerpTarget = null;      // override projectile action-cam immediately
    state.impactCameraTarget = null;
    state.impactCameraTimer = null;

    const tankWorldX = tank.x * BLOCK_SIZE;
    const tankWorldY = (tank.y - 0.5) * BLOCK_SIZE;
    const tankWorldZ = tank.z * BLOCK_SIZE;

    state.camTargetLook.set(tankWorldX, tankWorldY + 0.5, tankWorldZ);

    if (state.isMultiplayer && state.playerRoleState === 'passive') {
        // Taktischer Drohnen-Winkel aus Perspektive des passiven Spielers
        const localMultiplier = (state.localPlayerRole === 1) ? -1 : 1;
        state.camTargetPos.set(
            tankWorldX + (localMultiplier * 22), // Größerer Abstand für besseren Überblick
            tankWorldY + 12,                    // Höherer Winkel
            tankWorldZ + 6                       // Schräger Winkel für Tiefe
        );
    } else {
        // Normale Third-Person-Steuerungsansicht des aktiven Spielers
        const directionMultiplier = (tank.player === 1) ? -1 : 1;
        state.camTargetPos.set(
            tankWorldX + (directionMultiplier * 14),
            tankWorldY + 8,
            tankWorldZ + (Math.sin(tank.id) * 3)
        );
    }

    state.cameraTransitioning = true;
    console.log('[CAM] adjustCameraFocusOnTank → tank', tank.id, 'player', tank.player, 'role', state.playerRoleState, '| lerpTarget?', !!state.cameraLerpTarget, '| targetPos', state.camTargetPos.toArray().map(v=>v.toFixed(1)));
}

export function adjustCameraToFitTanks(tanksToFit) {
    console.log('[CAM] adjustCameraToFitTanks called | tanks:', tanksToFit?.length, '| lerpTarget?', !!state.cameraLerpTarget, '| activePlayer:', state.activePlayer);
    if (!tanksToFit || tanksToFit.length === 0) { console.warn('[CAM] adjustCameraToFitTanks: EMPTY tank list → returning early, no transition!'); return; }

    state.cameraLerpTarget = null;      // override projectile action-cam immediately
    state.impactCameraTarget = null;
    state.impactCameraTimer = null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    tanksToFit.forEach(tank => {
        const tx = tank.x * BLOCK_SIZE;
        const ty = (tank.y - 0.5) * BLOCK_SIZE;
        const tz = tank.z * BLOCK_SIZE;
        if (tx < minX) minX = tx;
        if (tx > maxX) maxX = tx;
        if (ty < minY) minY = ty;
        if (ty > maxY) maxY = ty;
        if (tz < minZ) minZ = tz;
        if (tz > maxZ) maxZ = tz;
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    state.camTargetLook.set(centerX, centerY + 0.5, centerZ);

    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    const size = Math.sqrt(dx*dx + dy*dy + dz*dz);

    const directionMultiplier = (state.isMultiplayer && state.localPlayerRole !== null)
        ? ((state.localPlayerRole === 1) ? -1 : 1)
        : ((state.activePlayer === 1) ? -1 : 1);
    
    // Scale distance based on boundary size to frame all tanks as big as possible
    const distance = Math.max(size * 1.25, 20.0);

    if (state.isMultiplayer && state.playerRoleState === 'passive') {
        // Taktische Übersicht aus Sichtseite des passiven Spielers
        state.camTargetPos.set(
            centerX + (directionMultiplier * distance * 1.0),
            centerY + Math.max(distance * 0.7, 13.0),
            centerZ + (distance * 0.4)
        );
    } else {
        // Normale aktive Übersicht
        state.camTargetPos.set(
            centerX + (directionMultiplier * distance * 0.8),
            centerY + Math.max(distance * 0.5, 9.0),
            centerZ + (distance * 0.3)
        );
    }

    state.cameraTransitioning = true;
    console.log('[CAM] adjustCameraToFitTanks → transition SET | targetPos', state.camTargetPos.toArray().map(v=>v.toFixed(1)));
}

export function selectTank(tank) {
    state.selectedTank = tank;
    
    if (state.isMultiplayer && state.activePlayer === state.localPlayerRole) {
        syncSelectedTank(tank ? tank.id : null);
        if (tank) {
            syncActiveTankState();
        }
    }

    if (tank) {
        adjustCameraFocusOnTank(tank);
    }
    updateUI();
}

export function createHighlightMesh(gx, gy, gz) {
    const geom = new THREE.BoxGeometry(BLOCK_SIZE * 0.95, 0.08, BLOCK_SIZE * 0.95);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0x10b981, 
        transparent: true, 
        opacity: 0.45,
        blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(gx * BLOCK_SIZE, (gy - 0.48) * BLOCK_SIZE, gz * BLOCK_SIZE);
    
    state.scene.add(mesh);
    movementHighlights.push(mesh);
}

export function clearHighlights() {
    movementHighlights.forEach(h => state.scene.remove(h));
    movementHighlights.length = 0; 
}

export function highlightPossibleMoves() {
    clearHighlights();
    if (!state.selectedTank || state.currentPhase !== 'MOVE' || state.actionsRemaining <= 0 || state.isGameOver) return;

    const x = state.selectedTank.x;
    const z = state.selectedTank.z;

    const absoluteYaw = state.selectedTank.bodyYaw + state.selectedTank.turretYaw;
    const fDir = getCardinalDirectionFromYaw(absoluteYaw, true);
    const bDir = getCardinalDirectionFromYaw(absoluteYaw, false);
    const directions = [fDir, bDir];

    directions.forEach(dir => {
        const nx = x + dir.dx;
        const nz = z + dir.dz;

        if (nx >= 0 && nx < GRID_SIZE_X && nz >= 0 && nz < GRID_SIZE_Z) {
            const isOccupied = tanks.some(t => t.x === nx && t.z === nz);
            if (!isOccupied) {
                const targetY = getSurfaceY(nx, nz);
                const currentY = state.selectedTank.y;
                
                if (targetY > 0 && Math.abs(targetY - currentY) <= 1) {
                    createHighlightMesh(nx, targetY, nz);
                }
            }
        }
    });
}

export function setPhase(newPhase) {
    state.currentPhase = newPhase;
    
    if (state.isMultiplayer && state.activePlayer === state.localPlayerRole) {
        syncPhase(newPhase);
    }
    
    if (newPhase === 'SELECT') {
        state.selectedTank = null;
        state.actionsRemaining = 15;
        clearHighlights();
        showAnnouncement(`Spieler ${state.activePlayer}: Wähle einen Panzer!`);
        
        // Fit all active player's tanks in camera view
        const activeTanks = tanks.filter(t => t.player === state.activePlayer);
        adjustCameraToFitTanks(activeTanks);
    } 
    else if (newPhase === 'MOVE') {
        state.actionsRemaining = 15;
        highlightPossibleMoves();
        showAnnouncement("Bewegungsphase! Nutze WASD / Pfeiltasten.");
    } 
    else if (newPhase === 'AIM') {
        clearHighlights();
        showAnnouncement("Zielphase! Richte deine Kanone aus.");
    }

    updateUI();
}

export function updateUI() {
    const turnDisplay = document.getElementById('turn-display');
    const phaseBadge = document.getElementById('phase-badge');
    const actionsLeftLabel = document.getElementById('actions-left');
    const controlsHelp = document.getElementById('controls-help-text');
    const p1Card = document.getElementById('player1-card');
    const p2Card = document.getElementById('player2-card');
    const shootPanel = document.getElementById('shooting-control-panel');
    const shootBtn = document.getElementById('shoot-button');
    const phaseActionBtn = document.getElementById('btn-phase-action');

    // Aktiven Spieler hervorheben
    if (state.activePlayer === 1) {
        turnDisplay.innerText = "SPIELER 1 AM ZUG";
        turnDisplay.className = "cyber-font text-[10px] text-emerald-400 tracking-wider";
        p1Card.classList.add('neon-glow-p1');
        p2Card.classList.remove('neon-glow-p2');
    } else {
        turnDisplay.innerText = "SPIELER 2 AM ZUG";
        turnDisplay.className = "cyber-font text-[10px] text-rose-400 tracking-wider";
        p2Card.classList.add('neon-glow-p2');
        p1Card.classList.remove('neon-glow-p1');
    }

    // Phase Badge & Controls anpassen
    if (state.currentPhase === 'SELECT') {
        phaseBadge.innerText = "Phase 1: Panzer wählen";
        phaseBadge.className = "cyber-font text-[10px] text-amber-400 font-bold mt-1 px-2 py-0.5 bg-amber-950/40 rounded-full border border-amber-500/30 inline-block uppercase tracking-wider";
        actionsLeftLabel.innerText = "Wähle einen Panzer";
        
        controlsHelp.innerHTML = `
            <li><strong class="text-indigo-300">Mausklick:</strong> Panzer anklicken zum Auswählen.</li>
            <li><strong class="text-indigo-300">Liste:</strong> Klicke auf Namen in der Seitenleiste.</li>
        `;
        
        shootPanel.classList.add('opacity-50');
        shootBtn.disabled = true;
        shootBtn.innerText = "ERST BEWEGUNG ABSCHLIESSEN";
        shootBtn.className = "flex-1 cyber-font text-[8px] font-bold bg-slate-800 text-slate-500 py-1.5 rounded-lg shadow-md tracking-wider border border-slate-700 cursor-not-allowed";
        
        phaseActionBtn.disabled = true;
        phaseActionBtn.innerText = "WÄHLEN...";
        phaseActionBtn.className = "bg-slate-800 text-slate-500 text-[10px] px-2 py-1.5 rounded-md font-bold cursor-not-allowed border border-slate-700 tech-font";
    } 
    else if (state.currentPhase === 'MOVE') {
        phaseBadge.innerText = "Phase 2: Bewegung";
        phaseBadge.className = "cyber-font text-[10px] text-cyan-400 font-bold mt-1 px-2 py-0.5 bg-cyan-950/40 rounded-full border border-cyan-500/30 inline-block uppercase tracking-wider";
        actionsLeftLabel.innerText = `${state.actionsRemaining} Schritte übrig`;

        controlsHelp.innerHTML = `
            <li><strong class="text-indigo-300">W / S (Auf/Ab):</strong> Vorwärts / Rückwärts in Schussrichtung.</li>
            <li><strong class="text-indigo-300">A / D (Links/Rechts):</strong> Panzer rotieren.</li>
            <li><strong class="text-indigo-300">Leertaste / Button:</strong> Fahrphase beenden & zielen.</li>
        `;

        shootPanel.classList.add('opacity-50');
        shootBtn.disabled = true;
        shootBtn.innerText = "ERST BEWEGUNG ABSCHLIESSEN";
        shootBtn.className = "flex-1 cyber-font text-[8px] font-bold bg-slate-800 text-slate-500 py-1.5 rounded-lg shadow-md tracking-wider border border-slate-700 cursor-not-allowed";

        phaseActionBtn.disabled = false;
        phaseActionBtn.innerText = "ZUM ZIELEN";
        phaseActionBtn.className = "bg-indigo-600/70 hover:bg-indigo-500 text-slate-200 text-[10px] px-2 py-1.5 rounded-md font-bold cursor-pointer border border-indigo-400/20 tech-font";
    } 
    else if (state.currentPhase === 'AIM') {
        phaseBadge.innerText = "Phase 3: Zielen & Schießen";
        phaseBadge.className = "cyber-font text-[10px] text-rose-400 font-bold mt-1 px-2 py-0.5 bg-rose-950/40 rounded-full border border-rose-500/30 inline-block uppercase tracking-wider";
        actionsLeftLabel.innerText = "Bereit zum Feuern";

        controlsHelp.innerHTML = `
            <li><strong class="text-indigo-300">A / D (Links/Rechts):</strong> Turm drehen.</li>
            <li><strong class="text-indigo-300">W / S (Auf/Ab):</strong> Kanone neigen.</li>
            <li><strong class="text-indigo-300">Leertaste (halten):</strong> Kraft laden & loslassen!</li>
        `;

        shootPanel.classList.remove('opacity-50');
        shootBtn.disabled = false;
        shootBtn.innerText = "FEUERKNOPF HALTEN (LEERTASTE)";
        shootBtn.className = "flex-1 cyber-font text-[8px] font-bold bg-gradient-to-r from-red-600/80 to-indigo-600/80 hover:from-red-500 hover:to-indigo-500 text-white py-1.5 rounded-lg shadow-md cursor-pointer tracking-wider border border-red-400/20";

        phaseActionBtn.disabled = true;
        phaseActionBtn.innerText = "FEUERN!";
        phaseActionBtn.className = "bg-slate-800 text-slate-500 text-[10px] px-2 py-1.5 rounded-md font-bold cursor-not-allowed border border-slate-700 tech-font";
    }

    // Status-Listen befüllen
    const p1Count = tanks.filter(t => t.player === 1).length;
    const p2Count = tanks.filter(t => t.player === 2).length;
    document.getElementById('p1-tanks-count').innerText = `${p1Count}/5 Panzer`;
    document.getElementById('p2-tanks-count').innerText = `${p2Count}/5 Panzer`;

    const buildList = (playerNum, elementId) => {
        const container = document.getElementById(elementId);
        container.innerHTML = '';
        tanks.filter(t => t.player === playerNum).forEach(t => {
            const isSelected = state.selectedTank === t;
            const el = document.createElement('div');
            el.className = `flex justify-between items-center text-[10px] p-1 rounded transition-all ${isSelected ? 'bg-indigo-600/30 border border-indigo-500/50 shadow-[0_0_6px_rgba(99,102,241,0.15)]' : 'bg-slate-950/30 hover:bg-slate-800/20 cursor-pointer'}`;
            el.onclick = () => {
                if (state.currentPhase === 'SELECT' && t.player === state.activePlayer) {
                    selectTank(t);
                    setPhase('MOVE');
                }
            };
            
            const hpPercent = t.hp / t.maxHp;
            const colorClass = hpPercent < 0.35 ? 'text-red-400 font-black' : (hpPercent < 0.7 ? 'text-amber-400' : 'text-slate-200');

            el.innerHTML = `
                <span class="truncate cyber-font font-bold tracking-wide">${t.name}</span>
                <span class="tech-font ${colorClass}">${t.hp} HP</span>
            `;
            container.appendChild(el);
        });
    };
    buildList(1, 'p1-tanks-list');
    buildList(2, 'p2-tanks-list');

    const selectedLabel = document.getElementById('selected-tank-label');
    const selectedHp = document.getElementById('selected-tank-hp');
    const selectedMp = document.getElementById('selected-tank-ap');

    if (state.selectedTank) {
        selectedLabel.innerText = state.selectedTank.name;
        selectedLabel.className = `cyber-font text-xs font-bold tracking-wider ${state.selectedTank.player === 1 ? 'text-emerald-400' : 'text-rose-400'}`;
        selectedHp.innerText = `${state.selectedTank.hp}/100`;
        selectedMp.innerText = (state.currentPhase === 'MOVE') ? `${state.actionsRemaining} AP` : '0 AP';
    } else {
        selectedLabel.innerText = "Kein Panzer gewählt";
        selectedLabel.className = "cyber-font text-[10px] text-slate-500";
        selectedHp.innerText = "-";
        selectedMp.innerText = "-";
    }

    // Update weapon toggle button based on state.shotMode
    const btnToggleMode = document.getElementById('btn-toggle-mode');
    if (btnToggleMode) {
        if (state.shotMode === 'sub') {
            btnToggleMode.innerText = 'DESTROY';
            btnToggleMode.className = "flex-1 cyber-font text-[8px] font-bold py-1.5 rounded-lg shadow-md tracking-wider border cursor-pointer transition-all duration-300 bg-rose-950/40 text-rose-400 border-rose-500/30 hover:bg-rose-900/40 hover:border-rose-500/50 shadow-[0_0_8px_rgba(244,63,94,0.2)] btn-mode-glow";
        } else if (state.shotMode === 'add') {
            btnToggleMode.innerText = 'VOXEL';
            btnToggleMode.className = "flex-1 cyber-font text-[8px] font-bold py-1.5 rounded-lg shadow-md tracking-wider border cursor-pointer transition-all duration-300 bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/40 hover:border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)] btn-mode-glow";
        } else if (state.shotMode === 'wall') {
            btnToggleMode.innerText = 'WALL';
            btnToggleMode.className = "flex-1 cyber-font text-[8px] font-bold py-1.5 rounded-lg shadow-md tracking-wider border cursor-pointer transition-all duration-300 bg-violet-950/40 text-violet-400 border-violet-500/30 hover:bg-violet-900/40 hover:border-violet-500/50 shadow-[0_0_8px_rgba(139,92,246,0.3)] btn-mode-glow";
        } else if (state.shotMode === 'shield') {
            btnToggleMode.innerText = 'SHIELD';
            btnToggleMode.className = "flex-1 cyber-font text-[8px] font-bold py-1.5 rounded-lg shadow-md tracking-wider border cursor-pointer transition-all duration-300 bg-cyan-950/40 text-cyan-400 border-cyan-500/30 hover:bg-cyan-900/40 hover:border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.3)] btn-mode-glow";
        }
    }

    if (state.isMultiplayer && state.activePlayer !== state.localPlayerRole) {
        const btnSkipTurn = document.getElementById('btn-skip-turn');
        if (shootBtn) {
            shootBtn.disabled = true;
            shootBtn.innerText = "WARTEN AUF GEGNER...";
            shootBtn.className = "flex-1 cyber-font text-[8px] font-bold bg-slate-800 text-slate-500 py-1.5 rounded-lg shadow-md tracking-wider border border-slate-700 cursor-not-allowed";
        }
        if (phaseActionBtn) {
            phaseActionBtn.disabled = true;
            phaseActionBtn.innerText = "GEGNER ZUG...";
            phaseActionBtn.className = "bg-slate-800 text-slate-500 text-[10px] px-2 py-1.5 rounded-md font-bold cursor-not-allowed border border-slate-700 tech-font";
        }
        if (btnToggleMode) {
            btnToggleMode.disabled = true;
            btnToggleMode.className = "flex-shrink-0 cyber-font text-[8px] font-bold py-1.5 px-3 rounded-lg shadow-md tracking-wider border cursor-not-allowed transition-all duration-300 bg-slate-800 text-slate-500 border-slate-700";
        }
        if (btnSkipTurn) {
            btnSkipTurn.disabled = true;
            btnSkipTurn.className = "bg-slate-800 text-slate-500 text-[10px] px-2 py-1.5 rounded-md font-bold cursor-not-allowed border border-slate-700 tech-font";
        }
        shootPanel.classList.add('opacity-50');

        // Observer feedback adjustments
        if (phaseBadge) {
            phaseBadge.innerText = "Zuschauer-Modus";
            phaseBadge.className = "cyber-font text-[10px] text-indigo-400 font-bold mt-1 px-2 py-0.5 bg-indigo-950/40 rounded-full border border-indigo-500/30 inline-block uppercase tracking-wider animate-pulse";
        }
        if (actionsLeftLabel) {
            actionsLeftLabel.innerText = `${state.opponentName || 'Gegner'} ist am Zug...`;
        }
        if (controlsHelp) {
            controlsHelp.innerHTML = `
                <li class="text-slate-400 font-medium"><i class="fas fa-eye mr-1"></i> Du schaust gerade zu.</li>
                <li>Die Kamera folgt den Aktionen des Gegners aus deiner Perspektive.</li>
            `;
        }
    }
}

export function updateWindUI() {
    const windArrow = document.getElementById('wind-arrow');
    const windLabel = document.getElementById('wind-strength-label');
    
    const deg = (state.windDirection * 180) / Math.PI;
    windArrow.style.transform = `rotate(${deg}deg)`;

    if (state.windSpeed === 0) {
        windLabel.innerText = "0 m/s";
        windLabel.className = "tech-font text-[9px] font-bold text-slate-400";
    } else if (state.windSpeed < 4) {
        windLabel.innerText = `${state.windSpeed} m/s`;
        windLabel.className = "tech-font text-[9px] font-bold text-cyan-400";
    } else {
        windLabel.innerText = `${state.windSpeed} m/s STURM`;
        windLabel.className = "tech-font text-[9px] font-bold text-amber-500 animate-pulse";
    }
}

export function nextTurn(targetPlayer = null) {
    console.log('[CAM] nextTurn called | targetPlayer:', targetPlayer, '| currentActivePlayer:', state.activePlayer, '| isGameOver:', state.isGameOver);
    if (state.isGameOver) return;

    if (targetPlayer !== null) {
        state.activePlayer = targetPlayer;
    } else {
        state.activePlayer = state.activePlayer === 1 ? 2 : 1;
    }

    if (state.isMultiplayer) {
        state.playerRoleState = (state.activePlayer === state.localPlayerRole) ? 'active' : 'passive';
    } else {
        state.playerRoleState = 'active';
    }

    state.shotMode = 'sub'; // Reset shotMode to sub on every new turn!
    tickActiveShields(state.activePlayer);

    if (!state.isMultiplayer) {
        state.windDirection = Math.random() * Math.PI * 2;
        state.windSpeed = Math.floor(Math.random() * 9); 
    }
    updateWindUI();

    const banner = document.getElementById('turn-banner');
    const bannerText = document.getElementById('turn-banner-text');
    bannerText.innerText = `SPIELER ${state.activePlayer} AM ZUG`;
    bannerText.className = `cyber-font text-lg md:text-2xl font-black tracking-widest ${state.activePlayer === 1 ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`;
    
    banner.classList.remove('opacity-0', 'pointer-events-none');
    banner.children[0].classList.remove('scale-90');
    banner.children[0].classList.add('scale-100');

    playSound('click');

    setTimeout(() => {
        banner.classList.add('opacity-0', 'pointer-events-none');
        banner.children[0].classList.remove('scale-100');
        banner.children[0].classList.add('scale-90');
    }, 1200);

    // Phase auf Auswahl zurücksetzen
    console.log('[CAM] nextTurn → calling setPhase(SELECT) | activePlayer now:', state.activePlayer);
    setPhase('SELECT');
}

export function checkVictory() {
    const p1Alive = tanks.some(t => t.player === 1);
    const p2Alive = tanks.some(t => t.player === 2);

    if (!p1Alive || !p2Alive) {
        state.isGameOver = true;
        const modal = document.getElementById('game-over-modal');
        const text = document.getElementById('winner-text');
        
        let winnerRole = 0;
        if (p1Alive && !p2Alive) {
            text.innerText = "Spieler 1 dominiert das Schlachtfeld!";
            text.className = "tech-font text-base text-emerald-400 mb-4";
            winnerRole = 1;
        } else if (p2Alive && !p1Alive) {
            text.innerText = "Spieler 2 dominiert das Schlachtfeld!";
            text.className = "tech-font text-base text-rose-400 mb-4";
            winnerRole = 2;
        } else {
            text.innerText = "Niemand überlebt das voxelierte Chaos!";
            text.className = "tech-font text-base text-slate-400 mb-4";
        }

        if (state.isMultiplayer && winnerRole !== 0) {
            if (state.localPlayerRole === winnerRole) {
                const myUid = state.playerUid;
                const oppUid = state.opponentUid;
                if (myUid) {
                    recordMatchResult(myUid, oppUid);
                }
            }
        }

        if (modal) {
            modal.classList.remove('opacity-0', 'pointer-events-none');
        }
        playSound('victory');
    }
}

export function showDamagePopup(amount, tankMesh, colorHex) {
    const camera = state.camera;
    if (!camera) return;

    // Get screen coordinates
    const vector = new THREE.Vector3();
    tankMesh.getWorldPosition(vector);
    vector.y += 2.5; // Offset upwards to show above the tank
    
    vector.project(camera);
    
    // Check if behind camera frustum
    if (vector.z > 1) return;

    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;

    const popup = document.createElement('div');
    popup.className = 'damage-popup cyber-font';
    popup.innerText = `-${amount} HP`;
    
    const colorStr = '#' + new THREE.Color(colorHex).getHexString();
    popup.style.color = colorStr;
    popup.style.textShadow = `0 0 10px ${colorStr}, 0 0 20px ${colorStr}`;
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;

    document.body.appendChild(popup);

    setTimeout(() => {
        popup.remove();
    }, 1000);
}

// deployShield instantiates a transparent shimmering dome over terrain, blocking bullets from hitting tanks inside
export function deployShield(ex, ey, ez, playerId) {
    playSound('shield_deploy');
    state.screenShakeIntensity = 0.6;
    
    // Player colors: Player 1 = 0x10b981 (emerald green), Player 2 = 0xf43f5e (rose red)
    const shieldColor = (playerId === 1) ? 0x10b981 : 0xf43f5e;
    const shieldColorHex = (playerId === 1) ? '#10b981' : '#f43f5e';
    
    // Create full sphere geometry
    // radius = 10 units (diameter 10 voxels, block size 2)
    const shieldGeom = new THREE.SphereGeometry(10, 32, 32);
    const shieldMat = new THREE.MeshPhongMaterial({
        color: shieldColor,
        transparent: true,
        opacity: 0.25,
        shininess: 100,
        specular: shieldColor,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending
    });
    const shieldMesh = new THREE.Mesh(shieldGeom, shieldMat);
    shieldMesh.position.set(ex, ey, ez);
    shieldMesh.scale.set(0.01, 0.01, 0.01);
    state.scene.add(shieldMesh);

    // Create floating text sprite for turnsLeft
    const sprite = createNumberSprite(10, shieldColorHex);
    sprite.position.set(ex, ey + 11.5, ez);
    sprite.scale.set(0.01, 0.01, 1);
    state.scene.add(sprite);

    // PointLight representing the energy source of the shield
    const pLight = new THREE.PointLight(shieldColor, 6.0, 30);
    pLight.position.set(ex, ey, ez);
    state.scene.add(pLight);

    const shieldObj = {
        owner: playerId,
        center: new THREE.Vector3(ex, ey, ez),
        radius: 10,
        turnsLeft: 10,
        mesh: shieldMesh,
        textSprite: sprite,
        pointLight: pLight,
        animating: true,
        animStartTime: performance.now(),
        animDuration: 1500
    };

    if (!state.activeShields) state.activeShields = [];
    state.activeShields.push(shieldObj);

    // Deduct charge
    if (!state.shieldCharges) state.shieldCharges = { 1: 1, 2: 1 };
    state.shieldCharges[playerId] = 0;
    
    showAnnouncement(`Spieler ${playerId}: Schutzkuppel aufgebaut (10 Runden)!`);
}

function createNumberSprite(number, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = 'bold 80px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.shadowColor = colorHex;
    ctx.shadowBlur = 15;
    ctx.fillStyle = colorHex;
    ctx.fillText(number.toString(), 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4, 4, 1);
    return sprite;
}

export function updateShieldSprite(shield) {
    const canvas = shield.textSprite.material.map.image;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = 'bold 80px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const colorHex = (shield.owner === 1) ? '#10b981' : '#f43f5e';
    ctx.shadowColor = colorHex;
    ctx.shadowBlur = 15;
    ctx.fillStyle = colorHex;
    ctx.fillText(shield.turnsLeft.toString(), 64, 64);
    shield.textSprite.material.map.needsUpdate = true;
}

export function tickActiveShields(newActivePlayer) {
    if (!state.activeShields) state.activeShields = [];
    if (!state.shieldCharges) state.shieldCharges = { 1: 1, 2: 1 };
    
    for (let i = state.activeShields.length - 1; i >= 0; i--) {
        const shield = state.activeShields[i];
        if (shield.owner === newActivePlayer) {
            shield.turnsLeft--;
            if (shield.turnsLeft <= 0) {
                state.scene.remove(shield.mesh);
                state.scene.remove(shield.textSprite);
                if (shield.pointLight) {
                    state.scene.remove(shield.pointLight);
                }
                state.activeShields.splice(i, 1);
                playSound('explosion');
                showAnnouncement(`Kuppel von Spieler ${shield.owner} ist erloschen!`);
            } else {
                updateShieldSprite(shield);
            }
        }
    }
}

export function startMultiplayerGame(seed) {
    // Reset state variables
    state.terrainSeed = seed;
    state.isGameOver = false;
    state.currentPhase = 'SELECT';
    state.activePlayer = 1;
    state.selectedTank = null;
    state.actionsRemaining = 15;
    state.isCharging = false;
    state.chargeStartTime = 0;
    state.moveCooldown = false;
    state.shotMode = 'sub';
    state.shieldCharges = { 1: 1, 2: 1 };
    state.playerWalls = { 1: [], 2: [] };
    state.pendingBlocks = [];

    // Clear tanks
    tanks.forEach(t => {
        if (t.mesh) state.scene.remove(t.mesh);
    });
    tanks.length = 0;

    // Clear projectiles
    projectiles.forEach(p => {
        if (p.mesh) state.scene.remove(p.mesh);
    });
    projectiles.length = 0;

    // Clear particles
    particles.forEach(p => {
        if (p.mesh) state.scene.remove(p.mesh);
    });
    particles.length = 0;

    // Clear shields
    if (state.activeShields) {
        state.activeShields.forEach(s => {
            if (s.mesh) state.scene.remove(s.mesh);
            if (s.textSprite) state.scene.remove(s.textSprite);
            if (s.pointLight) state.scene.remove(s.pointLight);
        });
        state.activeShields = [];
    }

    // Clear highlights
    clearHighlights();

    // Re-generate terrain using seed
    generateTerrain(seed);
    buildTerrainMesh();

    // Spawn tanks
    spawnTanks();

    // Update player names on UI
    const p1Name = (state.localPlayerRole === 1) ? state.playerName : state.opponentName;
    const p2Name = (state.localPlayerRole === 2) ? state.playerName : state.opponentName;
    
    const p1Label = document.getElementById('p1-card-title-text');
    const p2Label = document.getElementById('p2-card-title-text');
    if (p1Label) p1Label.innerText = p1Name.toUpperCase();
    if (p2Label) p2Label.innerText = p2Name.toUpperCase();

    // Hide intro modal
    const intro = document.getElementById('intro-modal');
    if (intro) {
        intro.classList.add('opacity-0', 'pointer-events-none');
    }

    // If local player is player 1, select first tank
    if (state.localPlayerRole === 1 && tanks.length > 0) {
        state.playerRoleState = 'active';
        setPhase('SELECT');
    } else {
        state.playerRoleState = 'passive';
        // Player 2 client starts by viewing Player 1's tanks since Player 1 goes first
        const p1Tanks = tanks.filter(t => t.player === 1);
        adjustCameraToFitTanks(p1Tanks);
        updateUI();
    }
}

export function setupMultiplayerUI() {
    const tabLocal = document.getElementById('tab-local');
    const tabMultiplayer = document.getElementById('tab-multiplayer');
    const panelLocal = document.getElementById('panel-local');
    const panelMultiplayer = document.getElementById('panel-multiplayer');

    if (tabLocal && tabMultiplayer && panelLocal && panelMultiplayer) {
        const mpInactive = () => {
            tabMultiplayer.className = "flex-1 py-2.5 cyber-font text-[10px] font-bold tracking-wider tab-mp-blink flex items-center justify-center gap-2";
            tabMultiplayer.innerHTML = '<span class="h-2 w-2 rounded-full bg-current animate-ping flex-shrink-0"></span>ONLINE&nbsp;MULTIPLAYER<span class="h-2 w-2 rounded-full bg-current animate-ping flex-shrink-0"></span>';
        };
        const mpActive = () => {
            tabMultiplayer.className = "flex-1 py-2.5 text-center cyber-font text-[10px] font-bold text-indigo-400 border-b-2 border-indigo-500 tracking-wider";
            tabMultiplayer.textContent = "ONLINE MULTIPLAYER";
        };

        tabLocal.addEventListener('click', () => {
            playSound('click');
            tabLocal.className = "flex-1 py-2 text-center cyber-font text-[9px] font-bold text-indigo-400 border-b-2 border-indigo-500 tracking-wider";
            mpInactive();
            panelMultiplayer.classList.add('hidden');
        });

        tabMultiplayer.addEventListener('click', () => {
            playSound('click');
            mpActive();
            tabLocal.className = "flex-1 py-2 text-center cyber-font text-[9px] font-bold text-slate-400 border-b-2 border-transparent tracking-wider";
            panelMultiplayer.classList.remove('hidden');
        });
    }

    const nameInput = document.getElementById('auth-name');
    const emailInput = document.getElementById('auth-email');
    const passInput = document.getElementById('auth-password');
    const errorMsg = document.getElementById('auth-error-msg');

    const authContainer = document.getElementById('auth-container');
    const lobbyContainer = document.getElementById('lobby-container');
    const waitingContainer = document.getElementById('waiting-container');

    const lobbyPilotName = document.getElementById('lobby-pilot-name');
    const lobbyPilotStats = document.getElementById('lobby-pilot-stats');

    const btnLoginEmail = document.getElementById('btn-login-email');
    const btnRegisterEmail = document.getElementById('btn-register-email');
    const btnLoginGuest = document.getElementById('btn-login-guest');
    const btnLogout = document.getElementById('btn-logout');

    const showAuthError = (err) => {
        if (errorMsg) {
            let msg = err.message || err || "Ein Fehler ist aufgetreten.";
            if (msg.includes("api-key-not-valid") || msg.includes("DummyKey") || msg.includes("API key not valid")) {
                msg = "⚠️ Firebase API-Key ungültig! Bitte trage deine echten Firebase-Daten in index.html (Zeilen 37–45) ein. Eine Anleitung findest du in der Datei FIREBASE_SETUP.md.";
            } else if (msg.includes("configuration-not-found")) {
                msg = "⚠️ Firebase-Konfigurationsfehler! Entweder sind die Anmeldemethoden (z. B. 'Anonym') in der Firebase Console nicht unter 'Authentication' -> 'Anmeldemethode' aktiviert, oder deine Konfiguration in index.html ist inkorrekt. Details findest du in FIREBASE_SETUP.md.";
            } else if (msg.includes("operation-not-allowed")) {
                msg = "⚠️ Diese Anmeldemethode ist nicht erlaubt! Bitte aktiviere 'Anonym' in deiner Firebase Console unter 'Authentication' -> 'Anmeldemethode'.";
            } else if (msg.includes("admin-restricted-operation")) {
                msg = "⚠️ Registrierung eingeschränkt! Bitte gehe in deiner Firebase Console zu 'Authentication' -> 'Einstellungen' (Settings) -> 'Nutzeraktionen' (User actions) und aktiviere dort 'Erstellung (Registrierung) aktivieren' (Enable create (sign-up)).";
            }
            errorMsg.innerText = msg;
            errorMsg.classList.remove('hidden');
        }
    };
    const hideAuthError = () => {
        if (errorMsg) errorMsg.classList.add('hidden');
    };

    if (btnLoginEmail) {
        btnLoginEmail.addEventListener('click', async () => {
            playSound('click');
            hideAuthError();
            const email = emailInput?.value || "";
            const pass = passInput?.value || "";
            try {
                await loginWithEmail(email, pass);
            } catch (err) {
                showAuthError(err);
            }
        });
    }

    if (btnRegisterEmail) {
        btnRegisterEmail.addEventListener('click', async () => {
            playSound('click');
            hideAuthError();
            const name = nameInput?.value || "";
            const email = emailInput?.value || "";
            const pass = passInput?.value || "";
            if (!name.trim()) {
                showAuthError("Bitte gib einen Spielernamen ein.");
                return;
            }
            try {
                await registerWithEmail(email, pass, name);
            } catch (err) {
                showAuthError(err);
            }
        });
    }

    if (btnLoginGuest) {
        btnLoginGuest.addEventListener('click', async () => {
            playSound('click');
            hideAuthError();
            const name = nameInput?.value || "";
            try {
                await loginAnonymouslyAsGuest(name);
            } catch (err) {
                showAuthError(err);
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            playSound('click');
            hideAuthError();
            try {
                await logoutUser();
            } catch (err) {
                console.error(err);
            }
        });
    }

    const renderLeaderboard = async () => {
        const listContainer = document.getElementById('leaderboard-list');
        if (!listContainer) return;
        listContainer.innerHTML = '<div class="text-slate-500 text-center py-2">Lade Pilotendaten...</div>';
        try {
            const list = await getLeaderboard();
            listContainer.innerHTML = '';
            if (list.length === 0) {
                listContainer.innerHTML = '<div class="text-slate-500 text-center py-2">Keine Einträge vorhanden.</div>';
                return;
            }
            list.forEach((user, idx) => {
                const item = document.createElement('div');
                item.className = "flex justify-between items-center py-0.5 border-b border-slate-900 last:border-b-0";
                item.innerHTML = `
                    <span class="truncate"><span class="text-indigo-400 font-bold">#${idx+1}</span> ${user.name}</span>
                    <span class="tech-font font-bold text-slate-300">${user.wins} S / ${user.losses} N</span>
                `;
                listContainer.appendChild(item);
            });
        } catch (err) {
            console.error("Leaderboard error:", err);
            listContainer.innerHTML = '<div class="text-rose-400 text-center py-2">Ladefehler</div>';
        }
    };

    initAuth((user) => {
        if (user) {
            if (lobbyPilotName) lobbyPilotName.innerText = state.playerName;
            if (lobbyPilotStats) lobbyPilotStats.innerText = `${state.playerWins} Siege / ${state.playerLosses} Niederlagen`;
            authContainer?.classList.add('hidden');
            lobbyContainer?.classList.remove('hidden');
            waitingContainer?.classList.add('hidden');
            renderLeaderboard();
        } else {
            if (nameInput) nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (passInput) passInput.value = '';
            authContainer?.classList.remove('hidden');
            lobbyContainer?.classList.remove('hidden');
            waitingContainer?.classList.add('hidden');
        }
    });

    const btnCreateLobby = document.getElementById('btn-create-lobby');
    const btnJoinLobby = document.getElementById('btn-join-lobby');
    const btnLeaveLobby = document.getElementById('btn-leave-lobby');
    const joinRoomCodeInput = document.getElementById('join-room-code');

    const waitingRoomCode = document.getElementById('waiting-room-code');
    const waitingP1Name = document.getElementById('waiting-p1-name');
    const waitingP2Name = document.getElementById('waiting-p2-name');

    if (btnCreateLobby) {
        btnCreateLobby.addEventListener('click', async () => {
            playSound('click');
            try {
                const lobbyId = await createLobby();
                if (waitingRoomCode) waitingRoomCode.innerText = lobbyId;
                if (waitingP1Name) waitingP1Name.innerText = state.playerName;
                if (waitingP2Name) waitingP2Name.innerText = "WARTE...";
                
                lobbyContainer?.classList.add('hidden');
                waitingContainer?.classList.remove('hidden');
            } catch (err) {
                console.error("Create lobby error:", err);
                alert(err.message || err);
            }
        });
    }

    if (btnJoinLobby) {
        btnJoinLobby.addEventListener('click', async () => {
            playSound('click');
            const code = joinRoomCodeInput?.value || "";
            if (!code.trim()) {
                alert("Bitte gib einen Lobby-Code ein.");
                return;
            }
            try {
                await joinLobby(code);
            } catch (err) {
                console.error("Join lobby error:", err);
                alert(err.message || err);
            }
        });
    }

    if (btnLeaveLobby) {
        btnLeaveLobby.addEventListener('click', async () => {
            playSound('click');
            try {
                await leaveLobby();
                waitingContainer?.classList.add('hidden');
                lobbyContainer?.classList.remove('hidden');
            } catch (err) {
                console.error("Leave lobby error:", err);
            }
        });
    }

    if (isPlaceholder) {
        showAuthError("⚠️ Du verwendest noch das Standard-Firebase-Projekt 'voxel-panzer'. Um Multiplayer spielen zu können, musst du deine eigenen Firebase-Projektdaten in die index.html (Zeilen 37–45) eintragen! Siehe FIREBASE_SETUP.md.");
    }
}
