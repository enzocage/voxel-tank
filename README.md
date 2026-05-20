# Voxel Panzer 3D: Space Tactical Combat
An interactive, 3D browser-based voxel tank tactical game powered by Three.js and OrbitControls, featuring a highly-polished cyberpunk theme, dynamic destructible terrain, and procedural audio.

---

## 🚀 Key Features

* **3-Phase Tactical Gameplay**:
  * **Phase 1 - Select**: Choose from active squad units.
  * **Phase 2 - Movement**: Drive voxel by voxel across hills and craters (15 Action Points per turn).
  * **Phase 3 - Aim & Shoot**: Rotate turret, adjust barrel pitch, and charge up reactor firing speed.
* **Destructible Voxel Terrain**: Projectile explosions realisticly blast away blocks, creating strategic cover or hazards. Units fall and sustain damage if terrain beneath them is destroyed.
* **Procedural Synthesizer Audio**: Completely self-contained music and sound effect generators created dynamically via the Web Audio API (no external asset downloads required).
* **Atmospheric Visuals**: Cyberpunk dark mode layout with responsive neon cards, screen shakes, trajectory path prediction, point light emissions, and animated turn banners.
* **Action Camera Tracking**: Cameras dynamically lock-on to fired projectiles for dramatic impact views.

---

## 🛠️ Technology Stack

* **Rendering Engine**: [Three.js](https://threejs.org/) (WebGL)
* **Controls**: OrbitControls for complete 360° space battlefield inspection.
* **Styling**: Tailwind CSS & FontAwesome Icons.
* **Architecture**: Vanilla Javascript utilizing modern **ES Modules** (ESM).
* **Audio**: Custom browser Web Audio API synthesizer.

---

## 📂 Project Structure

```
├── index.html          # Main application interface and Tailwind setup
├── css/
│   └── style.css       # Custom futuristic cyber-design styling
└── js/
    ├── constants.js    # Shared grid, block sizes, and color palettes
    ├── state.js        # Centralized reactive game state manager
    ├── audio.js        # Procedural synthwave loops and sfx generators
    ├── terrain.js      # Voxel matrix grid & height-map generation
    ├── particles.js    # Explosion debris, dust, and projectile trail engine
    ├── projectile.js   # Kinematic motion, wind drift, and blast algorithms
    ├── tank.js         # Voxel mesh constructor, stats, and unit gravity
    ├── ui.js           # Responsive UI panels and state-driven updates
    ├── input.js        # Keyboard bindings and raycast selection routing
    └── main.js         # Viewport initialization and main animation loop
```

---

## 🎮 How to Play

### 1. Game Setup
Open the application. Click **SYSTEM INITIATION** to start the synthwave background loop and launch the tactical grid.

### 2. Turn Loop Phases
1. **SELECT**: Select one of your active tanks by clicking them directly on the 3D grid or by selecting their name card in the sidebar.
2. **MOVE**: Use `WASD` or `Arrow Keys` to move. Each step uses 1 Action Point (AP). Press `Space` or click **ZUM ZIELEN** when done.
3. **AIM & SHOOT**:
   * Turn the turret: `A` / `D` (Left/Right)
   * Pitch the barrel: `W` / `S` (Up/Down)
   * Fire: Hold the **Spacebar** (or the shoot button) to charge projectile velocity, then release to launch!

---

## 💻 Local Development

Run a local web server in the root directory to support ES module loading:

```bash
# Using Node.js http-server
npx http-server -p 8080

# Or using Python
python -m http.server 8080
```

Open `http://localhost:8080` in your web browser.
