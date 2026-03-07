import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- 1. CONFIG ---
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

// State Variables
let currentSite = { name: "", city: "" };
let currentPlant = "";
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue')) || [];

// --- 2. AUTH & NAVIGATION ---
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
    document.getElementById(id).style.display = 'block';
    document.getElementById('btn-sync').style.display = offlineQueue.length > 0 ? 'inline-block' : 'none';
}

// --- 3. PAGE 1: SITE LOGIC ---
async function loadExistingSites() {
    const list = document.getElementById('site-list');
    list.innerHTML = '<li>Loading...</li>';
    const res = await callAPI('getSites');
    list.innerHTML = '';
    if (res.data) {
        res.data.forEach(site => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${site.name}</strong><br><small>${site.city}</small>`;
            li.onclick = () => {
                currentSite = { name: site.name, city: site.city };
                document.getElementById('current-site-title').innerText = "Site: " + site.name;
                showView('view-plants');
            };
            list.appendChild(li);
        });
    }
}

document.getElementById('btn-create-site').onclick = async () => {
    const payload = { 
        siteName: document.getElementById('site-name').value, 
        siteCity: document.getElementById('site-city').value 
    };
    if (!payload.siteName) return alert("Missing Site Name");
    
    await callAPI('createSite', payload);
    loadExistingSites();
};

// --- 4. PAGE 2: PLANT LOGIC ---
document.getElementById('btn-add-plant').onclick = () => {
    const name = document.getElementById('plant-name').value;
    if (!name) return alert("Plant Name required");
    
    const gallery = document.getElementById('plant-gallery');
    const div = document.createElement('div');
    div.className = 'plant-card';
    div.innerHTML = `<h3>${name}</h3><p>${document.getElementById('plant-desc').value}</p>`;
    div.onclick = () => {
        currentPlant = name;
        document.getElementById('asset-page-title').innerText = "Plant: " + name;
        showView('view-assets');
    };
    gallery.appendChild(div);
    document.getElementById('plant-name').value = '';
};

// --- 5. PAGE 3: ASSET LOGIC ---
document.getElementById('btn-save-asset').onclick = async () => {
    const photo = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;
    
    const payload = {
        siteName: currentSite.name,
        siteCity: currentSite.city,
        plantName: currentPlant,
        assetName: document.getElementById('asset-name').value,
        model: document.getElementById('asset-model').value,
        condition: document.getElementById('asset-condition').value,
        tag: document.getElementById('asset-tag').value,
        notes: document.getElementById('asset-notes').value,
        lat: gps.lat || "",
        lng: gps.lng || "",
        image: photo ? await toBase64(photo) : null,
        timestamp: new Date().toISOString()
    };

    if (navigator.onLine) {
        await callAPI('addAsset', payload);
        alert("Asset Saved!");
    } else {
        queueOffline('addAsset', payload);
    }
};

// --- 6. UTILITIES & OFFLINE ---
async function callAPI(action, payload = {}) {
    const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload })
    });
    return response.json();
}

function queueOffline(action, payload) {
    offlineQueue.push({ action, payload });
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    document.getElementById('btn-sync').style.display = 'inline-block';
    alert("Saved offline. Will sync when online.");
}

const toBase64 = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.readAsDataURL(f);
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = e => rej(e);
});

// GPS Helper
document.getElementById('btn-get-gps').onclick = () => {
    navigator.geolocation.getCurrentPosition(p => {
        const span = document.getElementById('gps-coords');
        span.innerText = `Fixed: ${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`;
        span.dataset.lat = p.coords.latitude;
        span.dataset.lng = p.coords.longitude;
    });
};
