import { loadMemory, loadCapabilities } from '../memory/memory.js';

class StateManager {
    constructor() {
        this.currentWs = null;
        this.lastInteractionTime = Date.now();
        this.memory = [];
        this.capabilities = loadCapabilities();
        this.isSystemTrigger = false;
        
        this.activeGame = null;
        this.isWatching = false;
        this.focusEndTime = 0;
        this.lastScoldTime = 0;
    }

    async init() {
        this.memory = await loadMemory();
    }

    setWs(ws) {
        this.currentWs = ws;
    }

    getWs() {
        return this.currentWs;
    }

    updateLastInteraction() {
        this.lastInteractionTime = Date.now();
    }

    getMemory() {
        return this.memory;
    }

    setMemory(newMemory) {
        this.memory = newMemory;
    }

    getCapabilities() {
        return this.capabilities;
    }
    
    getActiveGame() { return this.activeGame; }
    setActiveGame(game) { this.activeGame = game; }
    
    getIsWatching() { return this.isWatching; }
    setIsWatching(watching) { this.isWatching = watching; }
    
    getFocusEndTime() { return this.focusEndTime; }
    setFocusEndTime(time) { this.focusEndTime = time; }
    
    getLastScoldTime() { return this.lastScoldTime; }
    setLastScoldTime(time) { this.lastScoldTime = time; }
}

export const state = new StateManager();
