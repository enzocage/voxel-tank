# Firebase Setup Guide for Voxel Panzer 3D

To play the 2-player Online Multiplayer mode, you need to link your own Firebase project. Follow these quick steps to get it set up in 2 minutes:

## Step 1: Create a Firebase Project
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Projekt hinzufügen**).
3. Name your project (e.g., `Voxel Panzer 3D`), click **Continue**, and complete the creation process (you can disable Google Analytics for this project).

## Step 2: Register a Web App
1. On your project home page, click the **Web icon** (`</>`) to add an app.
2. Enter an app nickname (e.g., `voxel-panzer-web`) and click **Register app**.
3. Firebase will display your `firebaseConfig` credentials. Copy this block of code:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "your-project-id.firebaseapp.com",
     databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
     projectId: "your-project-id",
     storageBucket: "your-project-id.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

## Step 3: Enable Authentication
1. In the left-hand sidebar, click **Build** -> **Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab:
   - Click **Anonymous** (Anonym), toggle it to **Enable** (Aktivieren), and click **Save**.
   - (Optional) Click **Email/Password** (E-Mail/Passwort), toggle it to **Enable**, and click **Save** if you want to support registered account logins.

## Step 4: Create a Realtime Database
1. In the left-hand sidebar, click **Build** -> **Realtime Database**.
2. Click **Create Database** (Datenbank erstellen).
3. Choose your database location, click **Next**.
4. Select **Start in test mode** (Im Testmodus starten) so that read/write rules are open for playing (or ensure your rules allow reads and writes to `/users` and `/lobbies`), then click **Create** (Aktivieren).

## Step 5: Update index.html
1. Open [index.html](file:///c:/Users/enzoc/Desktop/AI%20Code/tank%20antigravity/index.html) in your editor.
2. Replace the dummy config (lines 37–45) with your copied config:
   ```html
   <script>
       window.FIREBASE_CONFIG = {
           apiKey: "YOUR_ACTUAL_API_KEY",
           authDomain: "your-project-id.firebaseapp.com",
           databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
           projectId: "your-project-id",
           storageBucket: "your-project-id.appspot.com",
           messagingSenderId: "...",
           appId: "..."
       };
   </script>
   ```
3. Save the file and hard-refresh (`Ctrl + F5` or `Cmd + Shift + R`) the page in your browser.

Now you can sign in as Guest, create or join lobbies, sync moves, and view the global leaderboard!
