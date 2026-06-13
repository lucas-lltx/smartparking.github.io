// ========================================================
// 📊 CORE STATE & ENTERPRISE DATABASE INITIALIZATION
// ========================================================

const initialUsers = {
    "driver1": { 
        username: "driver1", 
        password: "password123", 
        role: "user", 
        plate: "WXM 4231", 
        balance: 45.00, 
        points: 550, 
        activeSession: true, 
        assignedBay: "A1", 
        secondsActive: 120, 
        isValidated: false, 
        history: [] 
    },
    "driver2": { 
        username: "driver2", 
        password: "car123", 
        role: "user", 
        plate: "BKA 9901", 
        balance: 14.00, 
        points: 40, 
        activeSession: false, 
        assignedBay: null, 
        secondsActive: 0, 
        isValidated: false, 
        history: [{id:"TX-7711", bay:"A3", duration:"12m 40s", cost:2.50}] 
    },
    "staff1": { 
        username: "staff1", 
        password: "password456", 
        role: "staff", 
        plate: "SYS-HQ-NODE", 
        balance: 0.00, 
        points: 0, 
        activeSession: false, 
        history: [] 
    }
};

const initialWhitelist = ["VIP-777", "GOV-001", "WXM 4231"];

let initialBays = [
    { name: "A1", occupied: true, locked: false }, { name: "A2", occupied: false, locked: false },
    { name: "A3", occupied: false, locked: false }, { name: "A4", occupied: false, locked: false },
    { name: "B1", occupied: false, locked: false }, { name: "B2", occupied: false, locked: false },
    { name: "B3", occupied: false, locked: false }, { name: "B4", occupied: false, locked: false }
];

if (!localStorage.getItem('parking_db_v8')) {
    localStorage.setItem('parking_db_v8', JSON.stringify(initialUsers));
}
if (!localStorage.getItem('parking_whitelist_v8')) {
    localStorage.setItem('parking_whitelist_v8', JSON.stringify(initialWhitelist));
}
if (!localStorage.getItem('parking_bays_v8')) {
    localStorage.setItem('parking_bays_v8', JSON.stringify(initialBays));
}

let appState = {
    authMode: 'login',
    currentUser: null,
    tickerInterval: null,
    clockInterval: null
};

// ========================================================
// 🗺️ ROUTING ENGINE & STRUCTURAL LAYOUT HANDLERS
// ========================================================

function routeTo(pageId) {
    const viewContainer = document.getElementById('router-view');
    const template = document.getElementById(`page-${pageId.toLowerCase()}`);
    
    if (!viewContainer) return;
    if (!template) {
        if (pageId !== 'login') routeTo('login');
        return;
    }
    
    viewContainer.innerHTML = '';
    const clone = template.content.cloneNode(true);
    viewContainer.appendChild(clone);

    clearInterval(appState.clockInterval);

    if (pageId !== 'login' && appState.currentUser) {
        updateDOMMetrics();
        if (appState.currentUser.role === 'staff') {
            calculateHQAnalytics();
            renderStaffSensors();
            renderAuditLogs();
            renderVIPBadges();
            injectSystemAlerts("[SYSTEM INFO] Secured Administration Pipeline online.");
        } else {
            renderDriverMapGrid();
            startLiveTicker();
            renderLoyaltyTierBadge();
            startPassClock();
        }
    } else {
        clearInterval(appState.tickerInterval);
    }
}

function setAuthMode(mode) {
    appState.authMode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
    document.getElementById('signup-only-fields').classList.toggle('hidden', mode === 'login');
}

function handleAuthSubmit(e) {
    e.preventDefault();
    const userIn = document.getElementById('username').value.trim();
    const passIn = document.getElementById('password').value;
    const db = JSON.parse(localStorage.getItem('parking_db_v8'));

    if (appState.authMode === 'login') {
        const matchingUser = db[userIn];
        if (matchingUser && matchingUser.password === passIn) {
            appState.currentUser = matchingUser;
            sessionStorage.setItem('session_user_handle_v8', userIn);
            redirectUser(matchingUser.role);
        } else {
            alert('Invalid credentials.');
        }
    } else {
        const plateIn = document.getElementById('plate').value.trim().toUpperCase() || "N/A";
        const roleIn = document.getElementById('role').value;

        if (db[userIn]) return alert('Username already occupied.');

        db[userIn] = {
            username: userIn, password: passIn, role: roleIn, plate: plateIn, balance: 20.00, points: 0, activeSession: false, assignedBay: null, secondsActive: 0, isValidated: false, history: []
        };
        localStorage.setItem('parking_db_v8', JSON.stringify(db));
        
        appState.currentUser = db[userIn];
        sessionStorage.setItem('session_user_handle_v8', userIn);
        redirectUser(roleIn);
    }
}

function redirectUser(role) {
    if (role === 'staff') {
        routeTo('staff');
    } else {
        routeTo('dashboard');
    }
}

function updateDOMMetrics() {
    const user = appState.currentUser;
    if (!user) return;

    document.querySelectorAll('.user-display').forEach(el => el.innerText = user.username);
    document.querySelectorAll('.plate-display').forEach(el => el.innerText = user.plate);
    document.querySelectorAll('.points-display').forEach(el => el.innerText = user.points);
    document.querySelectorAll('.balance-display').forEach(el => el.innerText = user.balance.toFixed(2));

    if (user.role === 'user') {
        const activeView = document.getElementById('active-session-view');
        const noSessionView = document.getElementById('no-session-view');
        const ticketBox = document.getElementById('digital-ticket-box');

        if (user.activeSession) {
            if (activeView) activeView.classList.remove('hidden');
            if (noSessionView) noSessionView.classList.add('hidden');
            if (ticketBox) {
                ticketBox.classList.remove('hidden');
                document.getElementById('ticket-id').innerText = "PASS-" + user.plate.replace(/\s+/g, '-') + "-" + user.points;
            }
            document.getElementById('session-bay').innerText = user.assignedBay || "N/A";
            
            const vBadge = document.getElementById('validation-badge');
            if (vBadge) vBadge.classList.toggle('hidden', !user.isValidated);
            
            calculateLiveCostAndDuration();
        } else {
            if (activeView) activeView.classList.add('hidden');
            if (noSessionView) noSessionView.classList.remove('hidden');
        }
        renderLedgerHistory();
        evaluateGateSimulationState();
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    
    const matchedItem = Array.from(document.querySelectorAll('.nav-item')).find(item => 
        item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${tabId}'`)
    );
    if (matchedItem) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        matchedItem.classList.add('active');
    }

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.classList.remove('hidden');
    
    if (tabId === 'gate-simulation') {
        renderDriverMapGrid();
        evaluateGateSimulationState();
    }
}

function addFunds(amount) {
    appState.currentUser.balance += amount;
    saveStateToDB();
    updateDOMMetrics();
    alert(`Wallet configuration increased by +$${amount}.00`);
}

// ========================================================
// 🚗 SPATIAL GRID NODE MAP ENGINES
// ========================================================

function renderDriverMapGrid() {
    const grid = document.getElementById('driver-map-grid');
    if (!grid) return;
    const bays = JSON.parse(localStorage.getItem('parking_bays_v8'));

    grid.innerHTML = bays.map(b => {
        let stateClass = 'free';
        let statusText = 'AVAILABLE';
        if (b.locked) {
            stateClass = 'occupied';
            statusText = '🚨 MAINTENANCE';
        } else if (b.occupied) {
            stateClass = 'occupied';
            statusText = 'OCCUPIED';
        }
        return `
            <div class="map-bay ${stateClass}" onclick="selectBayForEntry('${b.name}', ${b.occupied || b.locked})">
                <h5>${b.name}</h5>
                <span>${statusText}</span>
            </div>
        `;
    }).join('');
}

function evaluateGateSimulationState() {
    const banner = document.getElementById('gate-occupancy-banner');
    const actionBlock = document.getElementById('gate-entry-action-block');
    if (!banner || !actionBlock) return;

    if (appState.currentUser.activeSession) {
        banner.className = "gate-status-banner open-pass";
        banner.innerText = "VEHICLE INSIDE FACILITIES";
        actionBlock.innerHTML = `<p style="color: var(--text-muted)">Tracking loop locked onto Bay ${appState.currentUser.assignedBay}.</p>`;
        return;
    }

    const bays = JSON.parse(localStorage.getItem('parking_bays_v8'));
    const unavailableCount = bays.filter(b => b.occupied || b.locked).length;
    const isFull = unavailableCount >= bays.length;

    if (isFull) {
        banner.className = "gate-status-banner full-block";
        banner.innerText = "⛔ CAPACITIES MAXIMUM REJECTED";
        actionBlock.innerHTML = `<p style="color: var(--danger); font-weight:600;">Hardware lock strikes online. Drop slots cleared upon car departure.</p>`;
    } else {
        banner.className = "gate-status-banner open-pass";
        banner.innerText = `✅ TRACK SPACES AVAILABLE (${bays.length - unavailableCount} Bays Free)`;
        actionBlock.innerHTML = `<span style="color: var(--text-muted); font-size:0.9rem;">← Select an available green bay on the grid map to raise boom gate.</span>`;
    }
}

function selectBayForEntry(bayName, isUnavailable) {
    if (isUnavailable) return alert("Sensor clash or Admin Lockdown. Choose empty array space.");
    if (appState.currentUser.activeSession) return;

    const bays = JSON.parse(localStorage.getItem('parking_bays_v8'));
    let target = bays.find(b => b.name === bayName);
    if (target) target.occupied = true;

    localStorage.setItem('parking_bays_v8', JSON.stringify(bays));

    appState.currentUser.activeSession = true;
    appState.currentUser.assignedBay = bayName;
    appState.currentUser.secondsActive = 0;
    appState.currentUser.isValidated = false;

    saveStateToDB();
    updateDOMMetrics();
    startLiveTicker();
    switchTab('home');
    alert(`Boom Arm Lifted! Parking slot ${bayName} allocated.`);
}

// ========================================================
// ⏱️ TIMERS, RATES & SETTLE MATRIX CONTROLS
// ========================================================

function startLiveTicker() {
    clearInterval(appState.tickerInterval);
    if (!appState.currentUser || !appState.currentUser.activeSession) return;

    appState.tickerInterval = setInterval(() => {
        if (appState.currentUser && appState.currentUser.activeSession) {
            appState.currentUser.secondsActive += 2; 
            calculateLiveCostAndDuration();
            saveStateToDB();
        }
    }, 2000);
}

function startPassClock() {
    const clockEl = document.getElementById('pass-timestamp');
    if (!clockEl) return;
    appState.clockInterval = setInterval(() => {
        const d = new Date();
        clockEl.innerText = d.toTimeString().split(' ')[0];
    }, 1000);
}

function renderLoyaltyTierBadge() {
    const badge = document.getElementById('tier-badge');
    if (!badge) return;
    const pts = appState.currentUser.points;

    if (pts >= 500) {
        badge.innerText = "Gold Tier Member (25% Disc Active) 🌟";
        badge.className = "tier-badge-pill tier-gold";
    } else if (pts >= 200) {
        badge.innerText = "Silver Tier Member 🥈";
        badge.className = "tier-badge-pill tier-silver";
    } else {
        badge.innerText = "Bronze Tier Driver 🥉";
        badge.className = "tier-badge-pill tier-bronze";
    }
}

function calculateLiveCostAndDuration() {
    const secs = appState.currentUser.secondsActive;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    const durationStr = `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    
    let baseCost = (secs * 0.05);
    if (appState.currentUser.isValidated) baseCost = Math.max(0, baseCost - 2.00);
    if (appState.currentUser.points >= 500) baseCost = baseCost * 0.75; 

    const durEl = document.getElementById('session-duration');
    const costEl = document.getElementById('session-cost');
    
    if (durEl) durEl.innerText = durationStr;
    if (costEl) costEl.innerText = `$${baseCost.toFixed(2)}`;
}

function validateMallReceipt() {
    if (appState.currentUser.isValidated) return alert("Validation applied once per loop session.");
    appState.currentUser.isValidated = true;
    saveStateToDB();
    updateDOMMetrics();
    alert("🛍️ Receipt verified! $2.00 discount injected into transaction profile.");
}

function simulateExitLoop() {
    const secs = appState.currentUser.secondsActive;
    let finalCost = (secs * 0.05);
    if (appState.currentUser.isValidated) finalCost = Math.max(0, finalCost - 2.00);
    if (appState.currentUser.points >= 500) finalCost = finalCost * 0.75;
    finalCost = Math.max(0, finalCost);

    if (appState.currentUser.balance < finalCost) {
        return alert(`Transaction Failure. Wallet requires $${finalCost.toFixed(2)} to discharge boom gate.`);
    }

    appState.currentUser.balance -= finalCost;
    appState.currentUser.points += 40; 
    appState.currentUser.activeSession = false;

    const m = Math.floor(secs / 60);
    const s = secs % 60;

    const txLog = {
        id: "TX-" + Math.floor(1000 + Math.random() * 9000),
        bay: appState.currentUser.assignedBay,
        duration: `${m}m ${s}s`,
        cost: finalCost
    };
    appState.currentUser.history.unshift(txLog);

    const bays = JSON.parse(localStorage.getItem('parking_bays_v8'));
    let activeBay = bays.find(b => b.name === appState.currentUser.assignedBay);
    if (activeBay) activeBay.occupied = false;

    appState.currentUser.assignedBay = null;
    appState.currentUser.secondsActive = 0;
    appState.currentUser.isValidated = false;

    localStorage.setItem('parking_bays_v8', JSON.stringify(bays));
    clearInterval(appState.tickerInterval);
    saveStateToDB();
    updateDOMMetrics();
    renderLoyaltyTierBadge();
    alert(`Outbound checkout cleared. Secure exit actuate raised. Drive safe!`);
}

// ========================================================
// 💎 CUSTOMER INTERACTIVE TRANSIT PASS ENGINE
// ========================================================

function interactWithTransitPass() {
    const user = appState.currentUser;
    if (!user || !user.activeSession) return;

    const barcodeArea = document.getElementById('interactive-barcode-area');
    const barcodeLines = document.getElementById('barcode-lines');
    const statusFlash = document.getElementById('ticket-status-flash');
    const ticketBox = document.getElementById('digital-ticket-box');
    const laser = document.getElementById('scanner-laser');

    if (laser) {
        laser.style.animation = "none";
        void laser.offsetWidth; 
        laser.style.animation = "scanAnimation 0.8s ease-in-out";
    }

    ticketBox.style.transform = "scale(0.96) rotate(-1deg)";
    setTimeout(() => { ticketBox.style.transform = "none"; }, 150);

    if (barcodeArea && barcodeLines && statusFlash) {
        barcodeArea.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
        barcodeLines.style.color = "var(--success)";
        statusFlash.innerText = "● TRANSMITTING";
        statusFlash.style.color = "var(--vip-gold)";
    }

    const structuralPillars = ["|", " ", "||", "|||", "||||"];
    let scrambledMatrix = "";
    for (let i = 0; i < 15; i++) {
        scrambledMatrix += structuralPillars[Math.floor(Math.random() * structuralPillars.length)];
    }
    if (barcodeLines) barcodeLines.innerText = scrambledMatrix;

    user.points += 5;
    saveStateToDB();
    updateDOMMetrics();
    renderLoyaltyTierBadge();

    setTimeout(() => {
        const freshArea = document.getElementById('interactive-barcode-area');
        const freshLines = document.getElementById('barcode-lines');
        const freshFlash = document.getElementById('ticket-status-flash');
        if (freshArea && freshLines && freshFlash) {
            freshArea.style.backgroundColor = "white";
            freshLines.style.color = "black";
            freshFlash.innerText = "● READY";
            freshFlash.style.color = "var(--success)";
        }
    }, 800);
}

function renderLedgerHistory() {
    const rows = document.getElementById('history-rows');
    if (!rows) return;
    if (appState.currentUser.history.length === 0) {
        rows.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted)">No history discovered within storage ledger.</td></tr>`;
        return;
    }
    rows.innerHTML = appState.currentUser.history.map(tx => `
        <tr>
            <td><code>${tx.id}</code></td>
            <td><span style="color:var(--warning)">${tx.bay}</span></td>
            <td>${tx.duration}</td>
            <td style="color:var(--danger); font-weight:700;">-$${tx.cost.toFixed(2)}</td>
        </tr>
    `).join('');
}

// ========================================================
// 🛡️ COMMAND ANALYTICS & ADVANCED HARDWARE CONTROLS
// ========================================================

function calculateHQAnalytics() {
    const db = JSON.parse(localStorage.getItem('parking_db_v8'));
    let totalRevenue = 0;

    Object.values(db).forEach(user => {
        if (user.role === 'user' && user.history) {
            user.history.forEach(tx => totalRevenue += tx.cost);
        }
    });

    const bays = JSON.parse(localStorage.getItem('parking_bays_v8'));
    let activeHardwareCount = bays.filter(b => b.occupied).length;
    let lockedHardwareCount = bays.filter(b => b.locked).length;
    
    let totalUnavailable = activeHardwareCount + lockedHardwareCount;
    let occupancyPercentage = Math.round((totalUnavailable / bays.length) * 100); 
    let vacantPercentage = 100 - occupancyPercentage;

    document.getElementById('hq-revenue').innerText = `$${totalRevenue.toFixed(2)}`;
    document.getElementById('hq-occupancy').innerText = `${occupancyPercentage}%`;

    const barOccupied = document.getElementById('bar-occupied');
    const barVacant = document.getElementById('bar-vacant');
    if (barOccupied) barOccupied.style.width = `${occupancyPercentage}%`;
    if (barVacant) barVacant.style.width = `${vacantPercentage}%`;

    const trafficText = document.getElementById('hq-traffic-prediction');
    if (!trafficText) return;

    if (occupancyPercentage >= 100) {
        trafficText.innerText = "CAPACITY MAXIMUM BLOCKED";
        trafficText.style.color = "var(--danger)";
    } else if (occupancyPercentage >= 50) {
        trafficText.innerText = "HEAVY METRIC APPROACH";
        trafficText.style.color = "var(--warning)";
    } else {
        trafficText.innerText = "OPTIMAL FLOW";
        trafficText.style.color = "var(--success)";
    }
}

function toggleBayLockdown(bayName) {
    const bays = JSON.parse(localStorage.getItem('parking_bays_v8'));
    let target = bays.find(b => b.name === bayName);
    
    if (!target) return;
    if (target.occupied) return alert(`Node ${bayName} cannot be put in maintenance because a vehicle is actively assigned.`);

    target.locked = !target.locked;
    localStorage.setItem('parking_bays_v8', JSON.stringify(bays));
    
    injectSystemAlerts(`[HARDWARE LOCKDOWN] Node ${bayName} toggled to ${target.locked ? 'MAINTENANCE SHIELD' : 'OPERATIONAL ONLINE'}`);
    renderStaffSensors();
    calculateHQAnalytics();
}

function removeUserRecord(username) {
    if (username === appState.currentUser.username) {
        return alert("Security System Fault: Cannot delete active root management handle context.");
    }
    if (!confirm(`CRITICAL PURGE: Permanently strip user registry profile [${username}] from storage tables?`)) return;

    const db = JSON.parse(localStorage.getItem('parking_db_v8'));
    
    if (db[username] && db[username].activeSession && db[username].assignedBay) {
        const bays = JSON.parse(localStorage.getItem('parking_bays_v8'));
        let targetBay = bays.find(b => b.name === db[username].assignedBay);
        if (targetBay) targetBay.occupied = false;
        localStorage.setItem('parking_bays_v8', JSON.stringify(bays));
    }

    delete db[username];
    localStorage.setItem('parking_db_v8', JSON.stringify(db));
    
    calculateHQAnalytics();
    renderStaffSensors();
    renderAuditLogs();
}

/**
 * ADMINISTRATIVE BALANCE CONFIGURATION ACCELERATOR
 * Allows rapid money adjustments directly on target database profiles.
 */
function setStaffUserMoney(username, targetAmount) {
    if (targetAmount === null) return; // Handle prompt termination smoothly

    const db = JSON.parse(localStorage.getItem('parking_db_v8'));
    if (!db || !db[username]) {
        alert(`Registry Error: Handle "${username}" not found.`);
        return;
    }

    const cleanAmount = parseFloat(targetAmount);
    if (isNaN(cleanAmount)) {
        alert("Configuration Error: Please specify a valid numerical value.");
        return;
    }

    const oldBalance = db[username].balance;
    db[username].balance = cleanAmount;
    localStorage.setItem('parking_db_v8', JSON.stringify(db));

    if (appState.currentUser && appState.currentUser.username === username) {
        appState.currentUser.balance = cleanAmount;
        updateDOMMetrics();
    }

    const logMsg = `[METRIC OVERRIDE] Balance for ${username} adjusted from $${oldBalance.toFixed(2)} to $${cleanAmount.toFixed(2)}`;
    console.log(logMsg);
    
    if (appState.currentUser && appState.currentUser.role === 'staff') {
        injectSystemAlerts(logMsg);
        calculateHQAnalytics();
        renderAuditLogs();
    }
}

function toggleGateOverride(isOpen) {
    const statusText = document.getElementById('hq-gate-status');
    if (!statusText) return;
    
    if (isOpen) {
        statusText.innerText = "MANUAL OVERRIDE BLOCKS UNLOCKED";
        statusText.className = "status-warn";
        injectSystemAlerts("[ALERT] Manual barrier open override actuated by administrator.");
    } else {
        statusText.innerText = "SECURELY LOCKED";
        statusText.className = "status-green";
        injectSystemAlerts("[INFO] Manual override dropped. Boom arm secure.");
    }
}

function addPlateToWhitelist() {
    const input = document.getElementById('whitelist-input');
    const plateNum = input.value.trim().toUpperCase();
    if (!plateNum) return;

    const whitelist = JSON.parse(localStorage.getItem('parking_whitelist_v8'));
    if (whitelist.includes(plateNum)) return alert('Vehicle plate code is already clear.');

    whitelist.push(plateNum);
    localStorage.setItem('parking_whitelist_v8', JSON.stringify(whitelist));
    
    injectSystemAlerts(`[VIP REGISTRY] Clear path whitelisting deployed for user: ${plateNum}`);
    input.value = '';
    renderVIPBadges();
}

function renderVIPBadges() {
    const rack = document.getElementById('vip-badge-rack');
    if (!rack) return;
    const whitelist = JSON.parse(localStorage.getItem('parking_whitelist_v8'));
    rack.innerHTML = whitelist.map(p => `<span class="vip-token">👑 ${p}</span>`).join('');
}

function injectSystemAlerts(message) {
    const feed = document.getElementById('system-notification-feed');
    if (!feed) return;

    const item = document.createElement('div');
    item.className = "feed-item neutral";
    
    if (message.includes("ALERT") || message.includes("LOCKDOWN")) {
        item.className = "feed-item alert";
    } else if (message.includes("VIP")) {
        item.className = "feed-item vip-alert";
    }
    
    item.innerText = message;
    feed.prepend(item);
}

function clearTelemetryFeed() {
    const feed = document.getElementById('system-notification-feed');
    if (feed) feed.innerHTML = `<div class="feed-item neutral">[SYSTEM INFO] Logs purged by system operator.</div>`;
}

function renderStaffSensors() {
    const grid = document.getElementById('staff-sensor-grid');
    if (!grid) return;
    const bays = JSON.parse(localStorage.getItem('parking_bays_v8'));
    
    grid.innerHTML = bays.map(b => {
        let badgeClass = 'available';
        let stateLabel = '🟢 CLEAR';
        if (b.locked) {
            badgeClass = 'occupied';
            stateLabel = '⚠️ LOCKDOWN';
        } else if (b.occupied) {
            badgeClass = 'occupied';
            stateLabel = '🔴 BLOCKED';
        }
        return `
            <div class="sensor-card ${badgeClass}" onclick="toggleBayLockdown('${b.name}')" style="cursor: pointer;">
                Bay Node ${b.name} 
                <span>${stateLabel}</span>
            </div>
        `;
    }).join('');
}

function renderAuditLogs() {
    const db = JSON.parse(localStorage.getItem('parking_db_v8'));
    const rows = document.getElementById('audit-log-rows');
    if (!rows) return;
    
    rows.innerHTML = Object.values(db).map(user => `
        <tr class="audit-row">
            <td class="search-username"><strong>${user.username}</strong></td>
            <td class="search-plate"><code>${user.plate || 'N/A'}</code></td>
            <td><span class="badge" style="background: rgba(255,255,255,0.03); padding: 4px 8px; border-radius:12px;">$${user.balance.toFixed(2)}</span></td>
            <td style="text-align: right; display: flex; gap: 8px; justify-content: flex-end;">
                <button class="action-btn" style="background: var(--primary); color: #fff; padding: 4px 10px; font-size: 0.75rem;" onclick="setStaffUserMoney('${user.username}', prompt('Configure precise financial balance for ${user.username}:', ${user.balance}))">Set Money</button>
                <button class="purge-btn" onclick="removeUserRecord('${user.username}')">Wipe Data</button>
            </td>
        </tr>
    `).join('');
}

function filterAuditLogs() {
    const searchVal = document.getElementById('log-search').value.toLowerCase();
    const rows = document.querySelectorAll('.audit-row');

    rows.forEach(row => {
        const username = row.querySelector('.search-username').innerText.toLowerCase();
        row.style.display = username.includes(searchVal) ? "" : "none";
    });
}

// ========================================================
// SECURITY SIGN OUT & DATA LIFECYCLE MANAGERS
// ========================================================

function saveStateToDB() {
    const db = JSON.parse(localStorage.getItem('parking_db_v8'));
    db[appState.currentUser.username] = appState.currentUser;
    localStorage.setItem('parking_db_v8', JSON.stringify(db));
}

function logout() {
    clearInterval(appState.tickerInterval);
    clearInterval(appState.clockInterval);
    appState.currentUser = null;
    sessionStorage.removeItem('session_user_handle_v8');
    appState.authMode = 'login';
    routeTo('login');
}

window.onload = () => {
    const cachedHandle = sessionStorage.getItem('session_user_handle_v8');
    if (cachedHandle) {
        const db = JSON.parse(localStorage.getItem('parking_db_v8'));
        if (db && db[cachedHandle]) {
            appState.currentUser = db[cachedHandle];
            redirectUser(db[cachedHandle].role);
            return;
        }
    }
    routeTo('login');
};
