import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCnfM942zYXkIorG2z9VtOJ56YorfK5_Zk",
    authDomain: "spirax-drive.firebaseapp.com",
    projectId: "spirax-drive",
    storageBucket: "spirax-drive.firebasestorage.app",
    messagingSenderId: "654602657737",
    appId: "1:654602657737:web:819eb168931cb2258c1218"
};

// IMPORTANT: Ensure this is the "/exec" URL from your latest Deployment
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz7YthwCWRynOV1k8s5U1_fVojBYIVHVEFIRxce1jg0NaytyH06QqR3AUD3n8aM4_c/exec";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let currentSite = { name: "", city: "" };
let currentPlant = "";

// --- CORE API CALL (The fix for "stops working") ---
async function callAPI(action, payload) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Use no-cors if you get a Redirection/CORS error
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action, payload })
        });
        
        // Note: 'no-cors' won't let us read the JSON response, 
        // but it ensures the data REACHES Google. 
        // Let's try standard fetch first:
        const normalResponse = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action, payload })
        });
        return await normalResponse.json();
    } catch (e) {
        console.error("API Failure:", e);
        return { status: "error" };
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

// --- SITES ---
async function loadExistingSites() {
    const list = document.getElementById('site-list');
    list.innerHTML = '<li>Loading...</li>';
    const res = await callAPI('getSites');
    if (res.status === 'success') {
        list.innerHTML = '';
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
        list.innerHTML = '<li>Error loading sites. Check Console.</li>';
    }
}

document.getElementById('btn-create-site').onclick = async () => {
    const name = document.getElementById('site-name').value;
    const city = document.getElementById('site-city').value;
    if(!name) return alert("Name required");
    
    document.getElementById('btn-create-site').innerText = "Creating...";
    const res = await callAPI('createSite', { siteName: name, siteCity: city });
    if(res.status === 'success') {
        alert("Site Folder Created!");
        loadExistingSites();
    }
    document.getElementById('btn-create-site').innerText = "Create Site";
};

// --- PLANTS & ASSETS (Standard Logic) ---
document.getElementById('btn-add-plant').onclick = () => {
    const name = document.getElementById('plant-name').value;
    if(!name) return;
    const gallery = document.getElementById('plant-gallery');
    const div = document.createElement('div');
    div.className = 'plant-card';
    div.innerHTML = `<h3>${name}</h3>`;
    div.onclick = () => {
        currentPlant = name;
        showView('view-assets');
    };
    gallery.appendChild(div);
};

document.getElementById('btn-get-gps').onclick = () => {
    navigator.geolocation.getCurrentPosition(p => {
        document.getElementById('gps-coords').innerText = p.coords.latitude.toFixed(4) + ", " + p.coords.longitude.toFixed(4);
        document.getElementById('gps-coords').dataset.lat = p.coords.latitude;
        document.getElementById('gps-coords').dataset.lng = p.coords.longitude;
    });
};

document.getElementById('btn-save-asset').onclick = async () => {
    const photo = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;
    const payload = {
        siteName: currentSite.name,
        siteCity: currentSite.city,
        plantName: currentPlant,
        assetName: document.getElementById('asset-name').value,
        lat: gps.lat || "",
        lng: gps.lng || "",
        image: photo ? await toBase64(photo) : null
    };
    await callAPI('addAsset', payload);
    alert("Asset Saved!");
};

const toBase64 = f => new Promise((res) => {
    const r = new FileReader();
    r.readAsDataURL(f);
    r.onload = () => res(r.result.split(',')[1]);
});

document.getElementById('btn-login').onclick = () => {
    signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
};
