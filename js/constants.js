export const GRID_SIZE_X = 32;
export const GRID_SIZE_Y = 12;
export const GRID_SIZE_Z = 32;
export const BLOCK_SIZE = 2;

export const PALETTE = {
    0: 0x000000, // Luft
    1: 0x0d3d4f, // Tiefes Gestein (dunkles Cyan-Blau)
    2: 0x12103a, // Abyssal-Block (dunkles Violett)
    3: 0x2d2a8a, // Tech-Grid Boden (dunkles Indigo)
    4: 0x0a6b4e, // Energiekristalle (dunkles Smaragd)
    5: 0x1a4d9e, // Neon-Energieknoten (dunkles Blau)
    6: 0x080e1a, // Verbranntes Aschegestein
    7: 0x10b981, // Schutzschild Spieler 1
    8: 0xf43f5e, // Schutzschild Spieler 2
};

export function getCardinalDirectionFromYaw(yaw, isForward = true) {
    let normYaw = yaw % (Math.PI * 2);
    if (normYaw < 0) normYaw += Math.PI * 2;

    const fx = Math.sin(normYaw);
    const fz = Math.cos(normYaw);

    let dx = 0;
    let dz = 0;

    if (Math.abs(fx) > Math.abs(fz)) {
        dx = fx > 0 ? 1 : -1;
    } else {
        dz = fz > 0 ? 1 : -1;
    }

    if (!isForward) {
        dx = -dx;
        dz = -dz;
    }

    return { dx, dz };
}
