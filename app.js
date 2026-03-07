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

const firebaseConfig = {
    apiKey: "AIzaSyCnfM942zYXkIorG2z9VtOJ56YorfK5_Zk",
    authDomain: "spirax-drive.firebaseapp.com",
    projectId: "spirax-drive",
    storageBucket: "spirax-drive.firebasestorage.app",
    messagingSenderId: "654602657737",
    appId: "1:654602657737:web:819eb168931cb2258c1218"
};

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz7YthwCWRynOV1k8s5U1_fVojBYIVHVEFIRxce1jg0NaytyH06QqR3AUD3n8aM4_c/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let currentSite = { name: "", city: "" };
let currentPlant = "";

// --- CORE API CALL (Fixed CORS & Redirect logic) ---
async function callAPI(action, payload) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            redirect: 'follow', // CRITICAL: Google Apps Script returns a 302 redirect
            headers: { 
                'Content-Type': 'text/plain;charset=utf-8' // Bypasses CORS preflight
            },
            body: JSON.stringify({ action, payload })
        });
        
        return await response.json();
    } catch (e) {
        console.error("API Failure:", e);
        return { status: "error", message: e.toString() };
    }
}

// --- NAVIGATION & AUTH ---
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
    const el = document.getElementById(id);
    if(el) el.style.display = 'block';
}

document.getElementById('btn-logout').onclick = () => {
    signOut(auth);
};

// --- SITES ---
async function loadExistingSites() {
    const list = document.getElementById('site-list');
    list.innerHTML = '<li>Loading...</li>';
    
    const res = await callAPI('getSites');
    
    if (res.status === 'success') {
        list.innerHTML = '';
        if (!res.data || res.data.length === 0) {
            list.innerHTML = '<li>No sites found. Create one above!</li>';
            return;
        }
        
        res.data.forEach(site => {
            const li = document.createElement('li');
            li.className = 'site-card';
            li.innerHTML = `<strong>${site.name}</strong><br>${site.city}`;
            li.onclick = () => {
                currentSite = site;
                document.getElementById('current-site-title').innerText = site.name;
                showView('view-plants');
            };
            list.appendChild(li);
        });
    } else {
        list.innerHTML = `<li>Error loading sites: ${res.message || 'Check Console.'}</li>`;
    }
}

document.getElementById('btn-create-site').onclick = async () => {
    const name = document.getElementById('site-name').value;
    const city = document.getElementById('site-city').value;
    if(!name) return alert("Site Name is required");
    
    const btn = document.getElementById('btn-create-site');
    btn.innerText = "Creating...";
    btn.disabled = true;

    const res = await callAPI('createSite', { siteName: name, siteCity: city });
    
    if(res.status === 'success') {
        alert("Site Folder Created!");
        document.getElementById('site-name').value = '';
        document.getElementById('site-city').value = '';
        loadExistingSites();
    } else {
        alert("Failed to create site. Check console.");
    }
    
    btn.innerText = "+ Create Site";
    btn.disabled = false;
};

// --- PLANTS & ASSETS ---
document.getElementById('btn-back-sites').onclick = () => showView('view-sites');
document.getElementById('btn-back-plants').onclick = () => showView('view-plants');

document.getElementById('btn-add-plant').onclick = () => {
    const name = document.getElementById('plant-name').value;
    if(!name) return alert("Plant name required");
    
    const gallery = document.getElementById('plant-gallery');
    const div = document.createElement('div');
    div.className = 'plant-card';
    div.innerHTML = `<h3>${name}</h3>`;
    div.onclick = () => {
        currentPlant = name;
        document.getElementById('asset-page-title').innerText = `${name} Assets`;
        showView('view-assets');
    };
    gallery.appendChild(div);
    document.getElementById('plant-name').value = ''; // Reset input
};

document.getElementById('btn-get-gps').onclick = () => {
    const btn = document.getElementById('btn-get-gps');
    btn.innerText = "Locating...";
    
    navigator.geolocation.getCurrentPosition(
        p => {
            document.getElementById('gps-coords').innerText = p.coords.latitude.toFixed(4) + ", " + p.coords.longitude.toFixed(4);
            document.getElementById('gps-coords').dataset.lat = p.coords.latitude;
            document.getElementById('gps-coords').dataset.lng = p.coords.longitude;
            btn.innerText = "📍 GPS Recorded";
        },
        err => {
            alert("Failed to get GPS. Please allow location access.");
            btn.innerText = "📍 Record GPS Location";
        }
    );
};

document.getElementById('btn-save-asset').onclick = async () => {
    const assetName = document.getElementById('asset-name').value;
    if (!assetName) return alert("Asset Name is required!");

    const photo = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;
    const btn = document.getElementById('btn-save-asset');
    
    btn.innerText = "Saving to Drive...";
    btn.disabled = true;

    const payload = {
        siteName: currentSite.name,
        siteCity: currentSite.city,
        plantName: currentPlant,
        assetName: assetName,
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
        alert("Asset Saved to Google Drive!");
        // Reset form
        document.querySelectorAll('.asset-form input, .asset-form textarea, .asset-form select').forEach(el => el.value = '');
        document.getElementById('gps-coords').innerText = "No GPS Data";
        document.getElementById('gps-coords').dataset.lat = "";
        document.getElementById('gps-coords').dataset.lng = "";
    } else {
        alert("Failed to save asset.");
    }
    
    btn.innerText = "Save Asset";
    btn.disabled = false;
};

const toBase64 = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.readAsDataURL(f);
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = error => rej(error);
});

document.getElementById('btn-login').onclick = () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value)
        .catch(err => alert("Login Failed: " + err.message));
};
