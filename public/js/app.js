// 1. Silence unhandled promise rejections originating from browser extension content scripts
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.message && event.reason.message.includes('Access to storage is not allowed')) {
        event.preventDefault();
    }
});

// 2. Safe mock storage fallback for restricted iframe/sandbox environments
(function preventStorageErrors() {
    const createMockStorage = () => {
        let store = {};
        return {
            getItem: (key) => store[key] || null,
            setItem: (key, value) => { store[key] = String(value); },
            removeItem: (key) => { delete store[key]; },
            clear: () => { store = {}; }
        };
    };

    try {
        window.localStorage.getItem('test');
    } catch (e) {
        Object.defineProperty(window, 'localStorage', {
            value: createMockStorage(),
            writable: false
        });
    }

    try {
        window.sessionStorage.getItem('test');
    } catch (e) {
        Object.defineProperty(window, 'sessionStorage', {
            value: createMockStorage(),
            writable: false
        });
    }
})();

// 3. Initialize Socket.io with sandbox-friendly transport flags
const socket = io({
    transports: ['websocket', 'polling'],
    autoConnect: true,
    withCredentials: false,
    rememberUpgrade: false
});

let currentNumFloors = 0;
let currentNumCars = 0;
const FLOOR_HEIGHT_PX = 90;

// 4. Form Submit Handler for Configuration Panel
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('configForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const config = {
                numCars: parseInt(document.getElementById('numCars').value, 10) || 3,
                numFloors: parseInt(document.getElementById('numFloors').value, 10) || 10,
                carCapacity: parseInt(document.getElementById('carCapacity').value, 10) || 8,
                totalTraffic: parseInt(document.getElementById('totalTraffic').value, 10) || 25,
                trafficMode: document.getElementById('trafficMode')?.value || 'balanced'
            };

            socket.emit('startSimulation', config);
        });
    }
});

// 5. Build Dynamic Elevator Shaft & Building Grid DOM
function buildBuildingDOM(floors, cars) {
    const grid = document.getElementById('buildingGrid');
    if (!grid) return;

    grid.innerHTML = '';
    currentNumFloors = floors;
    currentNumCars = cars;

    // Build Floor Labels Column
    const floorsContainer = document.createElement('div');
    floorsContainer.className = 'building-floors';

    for (let f = floors; f >= 1; f--) {
        const row = document.createElement('div');
        row.className = 'floor-row';

        const upBtn = f < floors ? `<button class="btn-floor btn-up" data-floor="${f}">▲</button>` : '';
        const downBtn = f > 1 ? `<button class="btn-floor btn-down" data-floor="${f}">▼</button>` : '';

        row.innerHTML = `
          <div class="floor-label">
            <span>F${f}</span>
            <div class="floor-actions">
              ${upBtn}
              <span class="queue-badge" id="q-floor-${f}">0</span>
              ${downBtn}
            </div>
          </div>
        `;
        floorsContainer.appendChild(row);
    }
    grid.appendChild(floorsContainer);

    // Build Shaft Columns with Parking Indicators & Cars
    const shaftsContainer = document.createElement('div');
    shaftsContainer.className = 'shafts-container';

    const step = Math.max(1, Math.floor(floors / cars));

    for (let c = 1; c <= cars; c++) {
        const shaft = document.createElement('div');
        shaft.className = 'shaft';
        shaft.id = `shaft-${c}`;

        const parkFloor = Math.min(floors, 1 + (c - 1) * step);

        // Render Parking Badge
        const parkBadge = document.createElement('div');
        parkBadge.className = 'park-indicator';
        parkBadge.innerText = `P${c}`;
        const parkBadgeTop = (floors - parkFloor) * FLOOR_HEIGHT_PX + 32;
        parkBadge.style.top = `${parkBadgeTop}px`;
        shaft.appendChild(parkBadge);

        // Persistent Elevator Car Element
        const carEl = document.createElement('div');
        carEl.className = 'car idle';
        carEl.id = `car-element-${c}`;
        carEl.style.height = `${FLOOR_HEIGHT_PX - 8}px`;

        shaft.appendChild(carEl);
        shaftsContainer.appendChild(shaft);
    }

    grid.appendChild(shaftsContainer);

    // Click handler for directional hall call buttons
    grid.onclick = (e) => {
        const target = e.target.closest('.btn-floor');
        if (!target) return;

        const floor = parseInt(target.getAttribute('data-floor'), 10);
        const direction = target.classList.contains('btn-up') ? 'UP' : 'DOWN';

        socket.emit('addDirectionalPassenger', { floor, direction });
    };
}

// 6. Socket State Update Stream Handler
socket.on('stateUpdate', (state) => {
    const tickEl = document.getElementById('simTick');
    if (tickEl) tickEl.innerText = `Tick: ${state.tick}`;

    const waitingEl = document.getElementById('mWaiting');
    if (waitingEl) waitingEl.innerText = state.passengerStats.waiting;

    const onboardEl = document.getElementById('mOnboard');
    if (onboardEl) onboardEl.innerText = state.passengerStats.onboard;

    const deliveredEl = document.getElementById('mDelivered');
    if (deliveredEl) deliveredEl.innerText = `${state.passengerStats.delivered}/${state.passengerStats.targetTotal}`;

    const totalEl = document.getElementById('mTotal');
    if (totalEl) totalEl.innerText = state.passengerStats.total;

    if (state.analytics) {
        const w = state.analytics.wait;
        const waitStatsEl = document.getElementById('mWaitStats');
        if (waitStatsEl) waitStatsEl.innerText = `${w.avg}s / ${w.min}s / ${w.max}s`;

        const rideAvgEl = document.getElementById('mRideAvg');
        if (rideAvgEl) rideAvgEl.innerText = `${state.analytics.ride.avg}s`;

        const carDistanceEl = document.getElementById('mCarDistance');
        if (carDistanceEl) carDistanceEl.innerText = `${state.analytics.totalCarDistance} floors`;
    }

    // Rebuild grid if floor or car counts change dynamically
    if (state.numFloors !== currentNumFloors || state.elevators.length !== currentNumCars) {
        buildBuildingDOM(state.numFloors, state.elevators.length);
    }

    // Update Hall Call Queues
    state.floorQueues.forEach(fq => {
        const badge = document.getElementById(`q-floor-${fq.floor}`);
        if (badge) {
            badge.innerText = fq.waitingCount;
            badge.style.opacity = fq.waitingCount > 0 ? '1' : '0.3';
        }

        const upBtn = document.querySelector(`.btn-up[data-floor="${fq.floor}"]`);
        const downBtn = document.querySelector(`.btn-down[data-floor="${fq.floor}"]`);

        if (upBtn) upBtn.classList.toggle('lit', fq.hasUpCall);
        if (downBtn) downBtn.classList.toggle('lit', fq.hasDownCall);
    });

    // Animate Cars & Update COP Panels
    state.elevators.forEach(car => {
        const carEl = document.getElementById(`car-element-${car.id}`);
        if (carEl) {
            const targetY = (state.numFloors - car.currentFloor) * FLOOR_HEIGHT_PX + 4;
            carEl.style.transform = `translateY(${targetY}px)`;

            let stateClass = 'car';
            let doorLabel = car.doorState;
            const isParking = car.direction.includes('(P)');

            if (isParking) {
                stateClass += ' parking';
            }

            if (car.doorHeld) {
                stateClass += ' door-held';
                doorLabel = '⚠️ HELD';
            } else if (car.doorState === 'OPEN') {
                stateClass += ' door-open';
                doorLabel = '🚪 OPEN';
            } else if (car.doorState === 'OPENING' || car.doorState === 'CLOSING') {
                stateClass += ' door-transition';
                doorLabel = car.doorState === 'OPENING' ? '↔ OPENING' : '➔ CLOSING';
            } else if (car.direction === 'IDLE') {
                stateClass += ' idle';
            }

            carEl.className = stateClass;

            const dirIcon = car.direction.includes('UP') ? '▲' : car.direction.includes('DOWN') ? '▼' : '●';
            const statusText = isParking ? '🅿️ PARK' : `${dirIcon} ${car.passengersCount}/${car.capacity}`;

            let copButtonsHTML = '';
            for (let f = 1; f <= state.numFloors; f++) {
                const isTarget = car.targets.includes(f);
                copButtonsHTML += `<span class="cop-btn ${isTarget ? 'lit' : ''}">${f}</span>`;
            }

            const isDoorOpenLit = car.doorState === 'OPEN' || car.doorState === 'OPENING';
            const isDoorHoldLit = car.doorHeld;

            copButtonsHTML += `<span class="cop-btn door-btn ${isDoorOpenLit ? 'lit' : ''}">&lt;&gt;</span>`;
            copButtonsHTML += `<span class="cop-btn door-btn ${isDoorHoldLit ? 'lit' : ''}">&gt;&lt;</span>`;

            carEl.innerHTML = `
                <div class="car-title">Car ${car.id}</div>
                <div class="car-dir">${statusText}</div>
                <div class="door-status">${doorLabel}</div>
                <div class="car-cop">${copButtonsHTML}</div>
            `;
        }
    });
});