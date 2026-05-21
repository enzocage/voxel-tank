export const GRID_SIZE_X = 32;
export const GRID_SIZE_Y = 12;
export const GRID_SIZE_Z = 32;
export const BLOCK_SIZE = 2;

export const PALETTE = {
    0: 0x000000, // Luft
    1: 0x155e75, // Tiefes Gestein (Cyan-Blau)
    2: 0x1e1b4b, // Abyssal-Block (Violett)
    3: 0x4f46e5, // Tech-Grid Boden (Indigo)
    4: 0x10b981, // Lebendige Energiekristalle (Smaragd)
    5: 0x3b82f6, // Neon-Energieknoten
    6: 0x0f172a, // Verbranntes Aschegestein (Schwarz)
    7: 0x10b981, // Gehärteter Schutzschild Spieler 1 (Smaragd)
    8: 0xf43f5e, // Gehärteter Schutzschild Spieler 2 (Rose-Rot)
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
