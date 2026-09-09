import { Elevator } from './Elevator.js';

export const DEFAULT_CONFIG = {
    NUM_FLOORS: 10,
    NUM_CARS: 3,
    CAR_CAPACITY: 8
};

export class Passenger {
    constructor(id, start, destination, requestTick) {
        this.id = id;
        this.start = start;
        this.destination = destination;
        this.requestTick = requestTick;
        this.boardTick = null;
        this.deliveryTick = null;
        this.state = 'WAITING'; // 'WAITING', 'ONBOARD', 'DELIVERED'
    }
}

export class ElevatorSimulation {
    constructor(config = {}) {
        this.numFloors = config.numFloors || DEFAULT_CONFIG.NUM_FLOORS;
        this.numCars = config.numCars || DEFAULT_CONFIG.NUM_CARS;
        this.carCapacity = config.carCapacity || DEFAULT_CONFIG.CAR_CAPACITY;

        this.tick = 0;
        this.isRunning = false;
        this.timer = null;

        this.elevators = [];
        for (let i = 1; i <= this.numCars; i++) {
            this.elevators.push(new Elevator(i, 1, this.carCapacity));
        }

        this.passengers = [];
        this.nextPassengerId = 1;
        this.onTick = null;

        this.updateParkingZones();
    }

    updateParkingZones() {
        const step = Math.max(1, Math.floor(this.numFloors / this.numCars));
        this.elevators.forEach((car, idx) => {
            const targetParkFloor = Math.min(this.numFloors, 1 + idx * step);
            car.assignParkingFloor(targetParkFloor);
        });
    }

    addDirectionalPassenger(floor, requestedDirection) {
        const floorQueueCount = this.passengers.filter(
            p => p.state === 'WAITING' && p.start === floor
        ).length;

        if (floorQueueCount >= 99) return;

        let dest;
        do {
            if (requestedDirection === 'UP') {
                dest = Math.floor(Math.random() * (this.numFloors - floor)) + floor + 1;
            } else {
                dest = Math.floor(Math.random() * (floor - 1)) + 1;
            }
        } while (dest === floor);

        this.passengers.push(new Passenger(this.nextPassengerId++, floor, dest, this.tick));
    }

    dispatchCalls() {
        const activeCalls = new Map();

        for (const p of this.passengers) {
            if (p.state !== 'WAITING') continue;

            const dir = p.destination > p.start ? 'UP' : 'DOWN';
            const callKey = `${p.start}_${dir}`;

            if (!activeCalls.has(callKey)) {
                activeCalls.set(callKey, { floor: p.start, direction: dir });
            }
        }

        const claimedCalls = new Set();

        for (const car of this.elevators) {
            if (car.isParking) continue;

            for (const targetFloor of car.targets) {
                claimedCalls.add(`${targetFloor}_UP`);
                claimedCalls.add(`${targetFloor}_DOWN`);
            }
        }

        for (const car of this.elevators) {
            if (car.passengers.length === 0 && !car.isParking && car.targets.size > 0) {
                for (const targetFloor of Array.from(car.targets)) {
                    const hasWaitingUp = activeCalls.has(`${targetFloor}_UP`);
                    const hasWaitingDown = activeCalls.has(`${targetFloor}_DOWN`);

                    if (!hasWaitingUp && !hasWaitingDown) {
                        car.targets.delete(targetFloor);
                    }
                }

                if (car.targets.size === 0) {
                    car.direction = 'IDLE';
                }
            }
        }

        for (const [callKey, call] of activeCalls.entries()) {
            if (claimedCalls.has(callKey)) continue;

            let bestCar = null;
            let minDistance = Infinity;

            for (const car of this.elevators) {
                if (car.isFull) continue;

                const distance = Math.abs(car.currentFloor - call.floor);
                const isTrulyIdle = car.targets.size === 0 || car.isParking || car.direction === 'IDLE';

                if (isTrulyIdle) {
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestCar = car;
                    }
                } else if (car.direction === call.direction) {
                    const isMovingTowards = call.direction === 'UP'
                        ? car.currentFloor <= call.floor
                        : car.currentFloor >= call.floor;

                    if (isMovingTowards && distance < minDistance) {
                        minDistance = distance;
                        bestCar = car;
                    }
                }
            }

            if (bestCar) {
                bestCar.clearParking();
                bestCar.targets.add(call.floor);
                claimedCalls.add(`${call.floor}_UP`);
                claimedCalls.add(`${call.floor}_DOWN`);

                bestCar.direction = call.floor > bestCar.currentFloor
                    ? 'UP'
                    : call.floor < bestCar.currentFloor
                        ? 'DOWN'
                        : call.direction;
            }
        }
    }

    processFloorEvents() {
        for (const car of this.elevators) {
            const isDestinationStop = car.passengers.some(p => p.destination === car.currentFloor);
            const isExplicitTarget = car.targets.has(car.currentFloor) && !car.isParking;

            if (isDestinationStop || isExplicitTarget) {
                if (car.doorState === 'CLOSED') {
                    car.triggerDoorCycle();
                }
            }

            if (car.doorState === 'OPEN') {
                car.targets.delete(car.currentFloor);

                const offboarding = car.passengers.filter(p => p.destination === car.currentFloor);
                for (const p of offboarding) {
                    p.state = 'DELIVERED';
                    p.deliveryTick = this.tick;
                }
                car.passengers = car.passengers.filter(p => p.destination !== car.currentFloor);

                const waitingAtFloor = this.passengers.filter(p => p.state === 'WAITING' && p.start === car.currentFloor);

                if (waitingAtFloor.length > 0 && (car.direction === 'IDLE' || car.passengers.length === 0)) {
                    const firstP = waitingAtFloor[0];
                    car.direction = firstP.destination > firstP.start ? 'UP' : 'DOWN';
                }

                const boardingPassengers = this.passengers.filter(p => {
                    if (p.state !== 'WAITING' || p.start !== car.currentFloor) return false;
                    const pDir = p.destination > p.start ? 'UP' : 'DOWN';
                    return car.direction === 'IDLE' || car.direction === pDir;
                });

                for (const p of boardingPassengers) {
                    if (!car.isFull) {
                        p.state = 'ONBOARD';
                        p.boardTick = this.tick;
                        car.passengers.push(p);
                        car.targets.add(p.destination);
                    }
                }
            }

            if (car.targets.size === 0 && car.passengers.length === 0 && car.doorState === 'CLOSED') {
                if (car.parkFloor && car.currentFloor !== car.parkFloor) {
                    car.isParking = true;
                    car.targets.add(car.parkFloor);
                    car.direction = car.parkFloor > car.currentFloor ? 'UP' : 'DOWN';
                }
            }
        }
    }

    step() {
        this.tick++;
        this.dispatchCalls();
        this.processFloorEvents();

        for (const car of this.elevators) {
            car.step();
        }

        if (this.onTick) this.onTick(this.getState());
    }

    start(onTickCallback, intervalMs = 1200) {
        this.isRunning = true;
        this.onTick = onTickCallback;

        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.step();
        }, intervalMs);
    }

    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    getState() {
        const waiting = this.passengers.filter(p => p.state === 'WAITING');
        const onboard = this.passengers.filter(p => p.state === 'ONBOARD');
        const delivered = this.passengers.filter(p => p.state === 'DELIVERED');

        const waitTimes = delivered.map(p => p.boardTick - p.requestTick);
        const rideTimes = delivered.map(p => p.deliveryTick - p.boardTick);

        const avgWait = waitTimes.length ? (waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length).toFixed(1) : 0;
        const minWait = waitTimes.length ? Math.min(...waitTimes) : 0;
        const maxWait = waitTimes.length ? Math.max(...waitTimes) : 0;

        const avgRide = rideTimes.length ? (rideTimes.reduce((a, b) => a + b, 0) / rideTimes.length).toFixed(1) : 0;

        const totalTraveled = this.elevators.reduce((sum, e) => sum + e.totalFloorsTraveled, 0);

        return {
            tick: this.tick,
            numFloors: this.numFloors,
            passengerStats: {
                waiting: waiting.length,
                onboard: onboard.length,
                delivered: delivered.length,
                targetTotal: this.passengers.length,
                total: this.passengers.length
            },
            analytics: {
                wait: { avg: avgWait, min: minWait, max: maxWait },
                ride: { avg: avgRide },
                totalCarDistance: totalTraveled
            },
            floorQueues: Array.from({ length: this.numFloors }, (_, i) => {
                const floorNum = i + 1;
                const waitingPassengers = this.passengers.filter(
                    p => p.state === 'WAITING' && p.start === floorNum
                );

                return {
                    floor: floorNum,
                    waitingCount: waitingPassengers.length,
                    hasUpCall: waitingPassengers.some(p => p.destination > floorNum),
                    hasDownCall: waitingPassengers.some(p => p.destination < floorNum)
                };
            }),
            elevators: this.elevators.map(car => ({
                id: car.id,
                currentFloor: car.currentFloor,
                capacity: car.capacity,
                passengersCount: car.passengers.length,
                direction: car.isParking ? `${car.direction} (P)` : car.direction,
                doorState: car.doorState,
                doorHeld: car.doorHeld,
                targets: Array.from(car.targets)
            }))
        };
    }
}