/**
 * SPIRAX-DIGITAL ASSET MANAGER - app.js
 * Comprehensive logic for Firebase Auth, Google Apps Script API, and PWA features.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- PWA SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.error('Service Worker registration failed', err));
    });
}

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCnfM942zYXkIorG2z9VtOJ56YorfK5_Zk",
    authDomain: "spirax-drive.firebaseapp.com",
    projectId: "spirax-drive",
    storageBucket: "spirax-drive.firebasestorage.app",
    messagingSenderId: "654602657737",
    appId: "1:654602657737:web:819eb168931cb2258c1218"
};

// IMPORTANT: Always ensure this is your LATEST Deployment URL from Apps Script
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz7YthwCWRynOV1k8s5U1_fVojBYIVHVEFIRxce1jg0NaytyH06QqR3AUD3n8aM4_c/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let currentSite = { name: "", city: "" };
let currentPlant = "";

// --- CORE API CALL (Handles Redirects and CORS) ---
async function callAPI(action, payload) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow', // MANDATORY: GAS returns 302 redirects
            headers: { 
                'Content-Type': 'text/plain;charset=utf-8' // Bypasses pre-flight CORS blocks
            },
            body: JSON.stringify({ action, payload })
        });
        
        if (!response.ok) throw new Error(`Network response was ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("API Call Error:", e);
        return { status: "error", message: e.toString() };
    }
}

// --- VIEW NAVIGATION & AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        showView('view-sites');
        loadExistingSites();
    } else {
        showView('view-login');
    }
});

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'block';
}

document.getElementById('btn-logout').onclick = () => signOut(auth);

// --- LOGIN LOGIC ---
document.getElementById('btn-login').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const btn = document.getElementById('btn-login');

    if (!email || !pass) return alert("Please fill in all fields.");

    btn.innerText = "Signing In...";
    btn.disabled = true;

    signInWithEmailAndPassword(auth, email, pass)
        .catch(err => {
            alert("Login Failed: " + err.message);
            btn.innerText = "Sign In";
            btn.disabled = false;
        });
};

// --- SITES LOGIC ---
async function loadExistingSites() {
    const list = document.getElementById('site-list');
    list.innerHTML = '<li><div class="loader"></div> Loading sites...</li>';
    
    const res = await callAPI('getSites');
    
    if (res.status === 'success') {
        list.innerHTML = '';
        if (!res.data || res.data.length === 0) {
            list.innerHTML = '<li>No sites found. Create one above!</li>';
            return;
        }
        
        // Reverse to show newest first
        res.data.reverse().forEach(site => {
            const li = document.createElement('li');
            li.className = 'site-card';
            li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
            li.onclick = () => {
                currentSite = site;
                document.getElementById('current-site-title').innerText = site.name;
                showView('view-plants');
            };
            list.appendChild(li);
        });
    } else {
        list.innerHTML = `<li style="color:red">Failed to load sites: ${res.message}</li>`;
    }
}

document.getElementById('btn-create-site').onclick = async () => {
    const name = document.getElementById('site-name').value;
    const city = document.getElementById('site-city').value;
    if (!name) return alert("Site Name is required");
    
    const btn = document.getElementById('btn-create-site');
    btn.innerText = "Creating Folder...";
    btn.disabled = true;

    const res = await callAPI('createSite', { siteName: name, siteCity: city });
    
    if (res.status === 'success') {
        alert("Success! Site created in Drive.");
        document.getElementById('site-name').value = '';
        document.getElementById('site-city').value = '';
        // Wait 1.5 seconds for Drive indexing before refreshing list
        setTimeout(loadExistingSites, 1500);
    } else {
        alert("Error creating site: " + res.message);
    }
    
    btn.innerText = "+ Create Site";
    btn.disabled = false;
};

// --- PLANTS LOGIC ---
document.getElementById('btn-back-sites').onclick = () => showView('view-sites');

document.getElementById('btn-add-plant').onclick = () => {
    const name = document.getElementById('plant-name').value;
    if (!name) return alert("Please enter a plant name.");
    
    const gallery = document.getElementById('plant-gallery');
    const div = document.createElement('div');
    div.className = 'plant-card';
    div.innerHTML = `<h3>${name}</h3><p>Tap to manage assets</p>`;
    div.onclick = () => {
        currentPlant = name;
        document.getElementById('asset-page-title').innerText = `${name} Assets`;
        showView('view-assets');
    };
    gallery.appendChild(div);
    document.getElementById('plant-name').value = ''; 
};

// --- ASSETS LOGIC ---
document.getElementById('btn-back-plants').onclick = () => showView('view-plants');

document.getElementById('btn-get-gps').onclick = () => {
    const btn = document.getElementById('btn-get-gps');
    btn.innerText = "Locating...";
    
    navigator.geolocation.getCurrentPosition(
        p => {
            const lat = p.coords.latitude.toFixed(5);
            const lng = p.coords.longitude.toFixed(5);
            document.getElementById('gps-coords').innerText = `${lat}, ${lng}`;
            document.getElementById('gps-coords').dataset.lat = lat;
            document.getElementById('gps-coords').dataset.lng = lng;
            btn.innerText = "📍 GPS Captured";
            btn.style.borderColor = "green";
        },
        err => {
            alert("Geolocation failed. Please enable location services.");
            btn.innerText = "📍 Retry GPS";
        }
    );
};

document.getElementById('btn-save-asset').onclick = async () => {
    const name = document.getElementById('asset-name').value;
    if (!name) return alert("Asset Name is required.");

    const btn = document.getElementById('btn-save-asset');
    const photo = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;
    
    btn.innerText = "Uploading to Drive...";
    btn.disabled = true;

    const payload = {
        siteName: currentSite.name,
        siteCity: currentSite.city,
        plantName: currentPlant,
        assetName: name,
        model: document.getElementById('asset-model').value,
        condition: document.getElementById('asset-condition').value,
        tag: document.getElementById('asset-tag').value,
        notes: document.getElementById('asset-notes').value,
        lat: gps.lat || "",
        lng: gps.lng || "",
        image: photo ? await toBase64(photo) : null
    };

    const res = await callAPI('addAsset', payload);
    
    if (res.status === 'success') {
        alert("Asset Saved successfully!");
        // Clear form
        document.getElementById('asset-name').value = '';
        document.getElementById('asset-notes').value = '';
        document.getElementById('asset-photo').value = '';
        document.getElementById('gps-coords').innerText = "No GPS Data";
    } else {
        alert("Upload Failed: " + res.message);
    }
    
    btn.innerText = "Save Asset";
    btn.disabled = false;
};

// --- HELPER: Image to Base64 ---
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});
