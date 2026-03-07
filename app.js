import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- PWA SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.error('SW registration failed', err));
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

// --- CORE API CALL (Fixed for Redirects/CORS) ---
async function callAPI(action, payload) {
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, payload })
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("API Call Error:", e);
        return { status: "error", message: e.toString() };
    }
}

// --- AUTH & NAVIGATION ---
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

document.getElementById('btn-login').onclick = () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert(err.message));
};

document.getElementById('btn-logout').onclick = () => signOut(auth);

// --- SITES LOGIC ---
async function loadExistingSites() {
    const list = document.getElementById('site-list');
    list.innerHTML = '<li>Loading sites...</li>';
    const res = await callAPI('getSites');
    if (res.status === 'success') {
        list.innerHTML = '';
        if (!res.data || res.data.length === 0) {
            list.innerHTML = '<li>No sites found.</li>';
            return;
        }
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
        list.innerHTML = `<li style="color:red">Error: ${res.message}</li>`;
    }
}

document.getElementById('btn-create-site').onclick = async () => {
    const name = document.getElementById('site-name').value;
    const city = document.getElementById('site-city').value;
    if (!name) return alert("Site Name required");
    const btn = document.getElementById('btn-create-site');
    btn.innerText = "Creating...";
    const res = await callAPI('createSite', { siteName: name, siteCity: city });
    if (res.status === 'success') {
        document.getElementById('site-name').value = '';
        document.getElementById('site-city').value = '';
        setTimeout(loadExistingSites, 1500);
    }
    btn.innerText = "+ Create Site";
};

// --- PLANTS & GPS ---
document.getElementById('btn-back-sites').onclick = () => showView('view-sites');
document.getElementById('btn-back-plants').onclick = () => showView('view-plants');

document.getElementById('btn-add-plant').onclick = () => {
    const name = document.getElementById('plant-name').value;
    if (!name) return alert("Enter plant name");
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
    document.getElementById('plant-name').value = '';
};

document.getElementById('btn-get-gps').onclick = () => {
    const btn = document.getElementById('btn-get-gps');
    btn.innerText = "Locating...";
    navigator.geolocation.getCurrentPosition(p => {
        const coords = document.getElementById('gps-coords');
        coords.innerText = `${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`;
        coords.dataset.lat = p.coords.latitude;
        coords.dataset.lng = p.coords.longitude;
        btn.innerText = "📍 GPS Recorded";
    });
};

// --- ASSET SAVE (WITH COMPRESSION & CLEANUP) ---
document.getElementById('btn-save-asset').onclick = async () => {
    const name = document.getElementById('asset-name').value;
    if (!name) return alert("Asset Name required");

    const btn = document.getElementById('btn-save-asset');
    const photoFile = document.getElementById('asset-photo').files[0];
    const gps = document.getElementById('gps-coords').dataset;

    btn.innerText = "Compressing & Saving...";
    btn.disabled = true;

    // COMPRESS IMAGE
    let compressedBase64 = null;
    if (photoFile) {
        compressedBase64 = await compressImage(photoFile, 1200, 0.7);
    }

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
        image: compressedBase64 // Sent for JPG creation, cleaned in backend for JSON
    };

    const res = await callAPI('addAsset', payload);
    if (res.status === 'success') {
        alert("Saved! Image compressed and JSON metadata is light.");
        // Clear form fields
        document.getElementById('asset-name').value = '';
        document.getElementById('asset-notes').value = '';
        document.getElementById('asset-photo').value = '';
        document.getElementById('gps-coords').innerText = "No GPS Data";
    } else {
        alert("Error: " + res.message);
    }
    btn.disabled = false;
    btn.innerText = "Save Asset";
};

// --- HELPER: CLIENT-SIDE COMPRESSION ---
function compressImage(file, maxWidth, quality) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
            };
        };
    });
}
