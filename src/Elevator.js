export class Elevator {
    constructor(id, currentFloor = 1, capacity = 8) {
        this.id = id;
        this.currentFloor = currentFloor;
        this.capacity = capacity;
        this.direction = 'IDLE'; // 'UP', 'DOWN', 'IDLE'
        this.passengers = [];
        this.targets = new Set();
        this.totalFloorsTraveled = 0;

        // Parking state
        this.parkFloor = null;
        this.isParking = false;

        // Door Management
        this.doorState = 'CLOSED'; // 'CLOSED', 'OPENING', 'OPEN', 'CLOSING'
        this.doorTimer = 0;
        this.doorHeld = false;
    }

    get isFull() {
        return this.passengers.length >= this.capacity;
    }

    triggerDoorCycle() {
        if (this.doorState === 'CLOSED') {
            this.doorState = 'OPENING';
            this.doorTimer = 1;
        }
    }

    advanceDoorCycle() {
        if (this.doorHeld) {
            this.doorState = 'OPEN';
            return;
        }

        if (this.doorTimer > 0) {
            this.doorTimer--;
            return;
        }

        switch (this.doorState) {
            case 'OPENING':
                this.doorState = 'OPEN';
                this.doorTimer = 2;
                break;
            case 'OPEN':
                this.doorState = 'CLOSING';
                this.doorTimer = 1;
                break;
            case 'CLOSING':
                this.doorState = 'CLOSED';
                break;
        }
    }

    assignParkingFloor(floor) {
        this.parkFloor = floor;
        if (this.targets.size === 0 && this.passengers.length === 0 && this.currentFloor !== floor) {
            this.isParking = true;
            this.targets.add(floor);
        }
    }

    clearParking() {
        if (this.isParking && this.parkFloor) {
            this.targets.delete(this.parkFloor);
            this.isParking = false;
        }
    }

    step() {
        // 1. Hold position while doors cycle
        if (this.doorState !== 'CLOSED') {
            this.advanceDoorCycle();
            return;
        }

        // 2. Stay on current floor if doors are preparing to open here or if parked
        if (this.targets.has(this.currentFloor)) {
            if (this.isParking) {
                // Reached parking destination
                this.targets.delete(this.currentFloor);
                this.isParking = false;
                this.direction = 'IDLE';
            }
            return;
        }

        // 3. Move directly toward target or parking floors
        if (this.targets.size > 0) {
            const targetFloors = Array.from(this.targets);
            const hasTargetsAbove = targetFloors.some(f => f > this.currentFloor);
            const hasTargetsBelow = targetFloors.some(f => f < this.currentFloor);

            if (hasTargetsAbove && (this.direction === 'UP' || this.direction === 'IDLE')) {
                this.direction = 'UP';
                this.currentFloor++;
                this.totalFloorsTraveled++;
            } else if (hasTargetsBelow && (this.direction === 'DOWN' || this.direction === 'IDLE')) {
                this.direction = 'DOWN';
                this.currentFloor--;
                this.totalFloorsTraveled++;
            } else if (hasTargetsAbove) {
                this.direction = 'UP';
                this.currentFloor++;
                this.totalFloorsTraveled++;
            } else if (hasTargetsBelow) {
                this.direction = 'DOWN';
                this.currentFloor--;
                this.totalFloorsTraveled++;
            }
        } else {
            this.direction = 'IDLE';
        }
    }
}