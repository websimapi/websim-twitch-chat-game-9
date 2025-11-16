import { Player } from './player.js';
import { Map as GameMap } from './map.js';
import { startChoppingCycle } from './player-actions.js';

const PLAYERS_STORAGE_PREFIX = 'twitch_game_players_';
const MAP_STORAGE_PREFIX = 'twitch_game_map_';

export class Game {
    constructor(canvas, channel) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.channel = channel; // Store channel name
        this.players = new Map();
        this.map = new GameMap(32); // TileSize is 32

        this.focusedPlayerId = null;
        this.focusTimer = 0;
        this.FOCUS_DURATION = 60; // seconds

        this.loadMap(); // Load map first
        this.loadPlayers(); // Load existing players on startup

        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Setup periodic save
        this.saveInterval = setInterval(() => {
            this.savePlayers();
            this.saveMap();
        }, 5000); // Save every 5 seconds
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Use a fixed tileSize for gameplay scale, allowing the map to be larger than viewport
        const fixedTileSize = 32; 
        this.map.setTileSize(fixedTileSize);

        this.map.setViewport(this.canvas.width, this.canvas.height);
    }

    savePlayers() {
        if (this.players.size === 0) return;

        const playerStates = {};
        for (const player of this.players.values()) {
            playerStates[player.id] = player.getState();
        }
        
        try {
            localStorage.setItem(PLAYERS_STORAGE_PREFIX + this.channel, JSON.stringify(playerStates));
            // User requested console logging coordinates
            if (this.players.size > 0) {
                const samplePlayer = this.players.values().next().value;
                const energyCount = samplePlayer.energyTimestamps ? samplePlayer.energyTimestamps.length : 0;
                console.log(`[Persistence] Saved state. Sample Player (${samplePlayer.username}): Position (${samplePlayer.pixelX.toFixed(2)}, ${samplePlayer.pixelY.toFixed(2)}), Energy Cells: ${energyCount}`);
            }
        } catch (e) {
            console.error("Could not save player data to localStorage:", e);
        }
    }

    saveMap() {
        const mapData = {
            grid: this.map.grid,
            treeRespawns: this.map.treeRespawns
        };
        try {
            localStorage.setItem(MAP_STORAGE_PREFIX + this.channel, JSON.stringify(mapData));
            console.log('[Persistence] Saved map data.');
        } catch (e) {
            console.error("Could not save map data to localStorage:", e);
        }
    }

    loadMap() {
        try {
            const data = localStorage.getItem(MAP_STORAGE_PREFIX + this.channel);
            if (data) {
                const mapData = JSON.parse(data);
                this.map.grid = mapData.grid;
                this.map.treeRespawns = mapData.treeRespawns || [];
                console.log('[Persistence] Loaded map data from localStorage.');
            } else {
                this.map.generateMap();
                console.log('[Persistence] No map data found. Generated a new map.');
                this.saveMap();
            }
        } catch(e) {
            console.error("Could not load map data, generating new map.", e);
            this.map.generateMap();
        }
    }

    loadPlayers() {
        try {
            const data = localStorage.getItem(PLAYERS_STORAGE_PREFIX + this.channel);
            if (data) {
                const playerStates = JSON.parse(data);
                for (const id in playerStates) {
                    const state = playerStates[id];
                    
                    // Sanity check: ensure required data is present
                    if (state && state.id && state.username) {
                        // Instantiate player using persisted info
                        const player = new Player(state.id, state.username, state.color);
                        player.loadState(state);
                        this.players.set(id, player);
                    }
                }
                console.log(`[Persistence] Loaded ${this.players.size} player states from localStorage for channel ${this.channel}.`);
                
                // Log data for active players as requested
                console.log("--- Active Player Data on Load ---");
                for (const player of this.players.values()) {
                    if (player.isPowered()) {
                        console.log(`User data for ${player.username}:`, player.getState());
                    }
                }
                console.log("------------------------------------");

                // If players were loaded, ensure focus is set if possible
                if (this.players.size > 0 && !this.focusedPlayerId) {
                    this.chooseNewFocus();
                }
            }
        } catch (e) {
            console.error("Could not load player data from localStorage:", e);
        }
    }

    handlePlayerCommand(userId, command) {
        const player = this.players.get(userId);
        if (!player) return;

        if (command === 'chop') {
            player.activeCommand = 'chop';
            if (player.isPowered()) {
                startChoppingCycle(player, this.map);
                console.log(`Player ${player.username} initiated !chop command.`);
            } else {
                 console.log(`Player ${player.username} set !chop command. It will start when they have energy.`);
            }
        }
    }

    addOrUpdatePlayer(chatter) {
        if (!chatter || !chatter.id) {
            console.error("Attempted to add or update player with invalid chatter data:", chatter);
            return;
        }
        let player = this.players.get(chatter.id);

        if (!player) {
            // Truly new player (not in persistence or current map)
            player = new Player(chatter.id, chatter.username, chatter.color);
            this.players.set(chatter.id, player);
            
            // Ensure player is positioned correctly on the map, avoiding obstacles
            player.setInitialPosition(this.map);

            console.log(`Player ${chatter.username} joined.`);
            
            // Initialize focus if necessary
            if (!this.focusedPlayerId) {
                this.focusedPlayerId = chatter.id;
                this.focusTimer = this.FOCUS_DURATION;
            }
        } else {
             // Existing player (loaded from storage or currently active)
             // Update volatile data like username/color which might change
             player.username = chatter.username;
             player.color = chatter.color;
        }

        player.addEnergy();
        console.log(`Player ${player.username} gained energy. Current energy cells: ${player.energyTimestamps.length}, Current Position: (${player.pixelX.toFixed(2)}, ${player.pixelY.toFixed(2)})`);
    }

    start() {
        this.map.loadAssets().then(() => {
            this.lastTime = performance.now();
            this.gameLoop();
        });
    }

    gameLoop(currentTime = performance.now()) {
        const deltaTime = (currentTime - this.lastTime) / 1000; // in seconds
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update(deltaTime) {
        // Handle Camera Focus Logic
        this.focusTimer -= deltaTime;
        if (this.focusTimer <= 0) {
            this.chooseNewFocus();
            this.focusTimer = this.FOCUS_DURATION;
        }

        this.map.update(this.players);

        for (const player of this.players.values()) {
            player.update(deltaTime, this.map);
        }
    }
    
    chooseNewFocus() {
        // Only focus on players who are currently powered
        const activePlayers = Array.from(this.players.values()).filter(p => p.isPowered());
        
        if (activePlayers.length === 0) {
            this.focusedPlayerId = null;
            this.focusTimer = this.FOCUS_DURATION; // Reset timer so it tries again soon
            console.log("No active players to focus on.");
            return;
        }

        const randomIndex = Math.floor(Math.random() * activePlayers.length);
        const player = activePlayers[randomIndex];
        
        this.focusedPlayerId = player.id;
        console.log(`Camera focusing on: ${player.username} for ${this.FOCUS_DURATION} seconds.`);
    }

    render() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        let cameraX = 0;
        let cameraY = 0;

        const focusedPlayer = this.focusedPlayerId ? this.players.get(this.focusedPlayerId) : null;
        const tileSize = this.map.tileSize;
        const mapPixelWidth = this.map.width * tileSize;
        const mapPixelHeight = this.map.height * tileSize;
        
        if (focusedPlayer) {
            // Player's center pixel position relative to map origin
            const playerCenterX = focusedPlayer.pixelX * tileSize + tileSize / 2;
            const playerCenterY = focusedPlayer.pixelY * tileSize + tileSize / 2;

            // Ideal Camera offset to center player on screen
            cameraX = playerCenterX - this.canvas.width / 2;
            cameraY = playerCenterY - this.canvas.height / 2;

            // Clamp X position
            if (mapPixelWidth > this.canvas.width) {
                const maxCameraX = mapPixelWidth - this.canvas.width;
                cameraX = Math.max(0, Math.min(cameraX, maxCameraX));
            } else {
                // Center map horizontally if smaller than viewport
                cameraX = -(this.canvas.width - mapPixelWidth) / 2;
            }

            // Clamp Y position
            if (mapPixelHeight > this.canvas.height) {
                const maxCameraY = mapPixelHeight - this.canvas.height;
                cameraY = Math.max(0, Math.min(cameraY, maxCameraY));
            } else {
                // Center map vertically if smaller than viewport
                cameraY = -(this.canvas.height - mapPixelHeight) / 2;
            }

        } else {
            // No player focused, center the map if it's smaller than the viewport
            if (this.canvas.width > mapPixelWidth) {
                 cameraX = -(this.canvas.width - mapPixelWidth) / 2;
            }
            if (this.canvas.height > mapPixelHeight) {
                cameraY = -(this.canvas.height - mapPixelHeight) / 2;
            }
        }

        this.map.render(this.ctx, cameraX, cameraY);
        
        // Only render players who are currently powered
        for (const player of this.players.values()) {
            if (player.isPowered()) {
                player.render(this.ctx, tileSize, cameraX, cameraY);
            }
        }
    }
}