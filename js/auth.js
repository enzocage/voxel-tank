// Firebase Authentication and User Statistics Module
import { auth, db } from './firebase-config.js?v=23';
import { state } from './state.js?v=23';
import { 
    signInAnonymously, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    ref, 
    set, 
    get, 
    update,
    query,
    orderByChild,
    limitToLast
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// Initialize Authentication Listener
export function initAuth(onUserLoaded) {
    if (!auth) {
        console.warn("Auth initialization skipped (Firebase not active).");
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.playerUid = user.uid;
            
            // Fetch stats and name from Realtime Database
            const userRef = ref(db, `users/${user.uid}`);
            try {
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    state.playerName = data.name || "Gast";
                    state.playerWins = data.wins || 0;
                    state.playerLosses = data.losses || 0;
                } else {
                    // Create entry if new (e.g. anonymous user)
                    const name = user.displayName || `Spieler_${user.uid.substring(0, 5)}`;
                    state.playerName = name;
                    state.playerWins = 0;
                    state.playerLosses = 0;
                    
                    await set(userRef, {
                        name: name,
                        wins: 0,
                        losses: 0
                    });
                }
                console.log("Logged in as:", state.playerName, "Wins:", state.playerWins, "Losses:", state.playerLosses);
            } catch (err) {
                console.error("Error reading user profile:", err);
                state.playerName = user.displayName || "Gast";
            }
            if (onUserLoaded) onUserLoaded(user);
        } else {
            state.playerUid = null;
            state.playerName = "Gast";
            state.playerWins = 0;
            state.playerLosses = 0;
            console.log("Logged out.");
            if (onUserLoaded) onUserLoaded(null);
        }
    });
}

// Register a new Email Account
export async function registerWithEmail(email, password, displayName) {
    if (!auth) throw new Error("Firebase is not initialized.");
    
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Set display name in Auth profile
    await updateProfile(user, { displayName });
    
    // Create profile in Realtime Database
    const userRef = ref(db, `users/${user.uid}`);
    await set(userRef, {
        name: displayName,
        wins: 0,
        losses: 0
    });
    
    return user;
}

// Login with Email Account
export async function loginWithEmail(email, password) {
    if (!auth) throw new Error("Firebase is not initialized.");
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
}

// Login Anonymously as Guest
export async function loginAnonymouslyAsGuest(guestName) {
    if (!auth) throw new Error("Firebase is not initialized.");
    
    const userCredential = await signInAnonymously(auth);
    const user = userCredential.user;
    
    const name = guestName.trim() || `Gast_${user.uid.substring(0, 5)}`;
    
    // Set display name
    await updateProfile(user, { displayName: name });
    
    // Create guest profile in database
    const userRef = ref(db, `users/${user.uid}`);
    await set(userRef, {
        name: name,
        wins: 0,
        losses: 0
    });
    
    return user;
}

// Log Out
export async function logoutUser() {
    if (!auth) return;
    await signOut(auth);
}

// Record match end results
export async function recordMatchResult(winnerUid, loserUid) {
    if (!db) return;
    
    if (winnerUid) {
        const winRef = ref(db, `users/${winnerUid}`);
        try {
            const snap = await get(winRef);
            if (snap.exists()) {
                const currentWins = snap.val().wins || 0;
                await update(winRef, { wins: currentWins + 1 });
                // If it is the local player, update local state
                if (state.playerUid === winnerUid) {
                    state.playerWins = currentWins + 1;
                }
            }
        } catch (e) {
            console.error("Failed to update winner stats:", e);
        }
    }
    
    if (loserUid) {
        const loseRef = ref(db, `users/${loserUid}`);
        try {
            const snap = await get(loseRef);
            if (snap.exists()) {
                const currentLosses = snap.val().losses || 0;
                await update(loseRef, { losses: currentLosses + 1 });
                // If it is the local player, update local state
                if (state.playerUid === loserUid) {
                    state.playerLosses = currentLosses + 1;
                }
            }
        } catch (e) {
            console.error("Failed to update loser stats:", e);
        }
    }
    
    // Also record on global leaderboard
    await updateLeaderboard();
}

// Get Leaderboard Data
export async function getLeaderboard() {
    if (!db) return [];
    
    const usersQuery = query(ref(db, 'users'), orderByChild('wins'), limitToLast(10));
    try {
        const snapshot = await get(usersQuery);
        const list = [];
        if (snapshot.exists()) {
            snapshot.forEach((childSnap) => {
                const val = childSnap.val();
                list.push({
                    uid: childSnap.key,
                    name: val.name,
                    wins: val.wins || 0,
                    losses: val.losses || 0
                });
            });
        }
        // Firebase queries return sorted ascending, we reverse it to get descending (highest first)
        return list.reverse();
    } catch (e) {
        console.error("Error fetching leaderboard:", e);
        return [];
    }
}

async function updateLeaderboard() {
    // Optional helper if we want a separate leaderboard node, 
    // but querying 'users' directly is simple and handles it fine.
}
