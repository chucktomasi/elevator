import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ElevatorSimulation } from './src/Simulation.js';

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let sim = null;

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('startSimulation', (config) => {
        if (sim) sim.stop();

        sim = new ElevatorSimulation(config);
        sim.start((state) => {
            io.emit('stateUpdate', state);
        });

        io.emit('stateUpdate', sim.getState());
    });

    socket.on('stopSimulation', () => {
        if (sim) {
            sim.stop();
        }
    });

    socket.on('addFloorPassenger', ({ floor }) => {
        if (sim && sim.isRunning) {
            sim.addPassengerAtFloor(floor);
            io.emit('stateUpdate', sim.getState());
        }
    });

    socket.on('removeFloorPassenger', ({ floor }) => {
        if (sim && sim.isRunning) {
            sim.removePassengerAtFloor(floor);
            io.emit('stateUpdate', sim.getState());
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

    socket.on('addDirectionalPassenger', ({ floor, direction }) => {
        if (sim && sim.isRunning) {
            sim.addDirectionalPassenger(floor, direction);
            io.emit('stateUpdate', sim.getState());
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});