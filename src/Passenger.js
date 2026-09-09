export class Passenger {
    constructor(id, start, destination, spawnTick) {
        this.id = id;
        this.start = start;
        this.destination = destination;
        this.direction = destination > start ? 'UP' : 'DOWN';
        this.state = 'WAITING'; // WAITING, ONBOARD, DELIVERED

        // Time metrics tracking (measured in ticks)
        this.spawnTick = spawnTick;
        this.boardTick = null;
        this.deliveryTick = null;
    }

    get waitTime() {
        if (this.boardTick === null) return null;
        return this.boardTick - this.spawnTick;
    }

    get rideTime() {
        if (this.deliveryTick === null || this.boardTick === null) return null;
        return this.deliveryTick - this.boardTick;
    }

    get totalTime() {
        if (this.deliveryTick === null) return null;
        return this.deliveryTick - this.spawnTick;
    }

    get distanceTraveled() {
        return Math.abs(this.destination - this.start);
    }
}