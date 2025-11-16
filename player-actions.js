import { PLAYER_STATE } from './player-state.js';
import { TILE_TYPE } from './map-tile-types.js';
import { AudioManager } from './audio-manager.js';
import { updateWander, updateMoveToTarget } from './player-movement.js';

function beginChopping(player) {
    player.state = PLAYER_STATE.CHOPPING;
    player.actionTimer = 11; // 11 seconds to chop
    console.log(`[${player.username}] Began chopping tree at (${player.actionTarget.x}, ${player.actionTarget.y}). Timestamp: ${Date.now()}`);
}

function finishChopping(player, gameMap) {
    const chopSound = AudioManager.getBuffer('./tree_fall.mp3');
    AudioManager.play(chopSound);

    const treeX = player.actionTarget.x;
    const treeY = player.actionTarget.y;

    gameMap.cutTree(treeX, treeY);
    player.actionTarget = { x: treeX, y: treeY };

    console.log(`[${player.username}] Finished chopping tree. Timestamp: ${Date.now()}`);
    player.addExperience('woodcutting', 3);

    player.pendingHarvest = [];
    let spawnedBushes = 0;
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    for (const [dx, dy] of directions) {
        const bushX = treeX + dx;
        const bushY = treeY + dy;
        if (bushX >= 0 && bushX < gameMap.width && bushY >= 0 && bushY < gameMap.height && 
            gameMap.grid[bushY][bushX] === TILE_TYPE.GRASS && Math.random() < 1/8) {
            gameMap.grid[bushY][bushX] = TILE_TYPE.BUSHES;
            player.pendingHarvest.push({ x: bushX, y: bushY, type: TILE_TYPE.BUSHES });
            spawnedBushes++;
        }
    }
    if (spawnedBushes === 0) {
        const validSpots = directions.filter(([dx, dy]) => {
            const bushX = treeX + dx;
            const bushY = treeY + dy;
            return bushX >= 0 && bushX < gameMap.width && bushY >= 0 && bushY < gameMap.height && gameMap.grid[bushY][bushX] === TILE_TYPE.GRASS;
        });
        if (validSpots.length > 0) {
            const [dx, dy] = validSpots[Math.floor(Math.random() * validSpots.length)];
            const bushX = treeX + dx;
            const bushY = treeY + dy;
            gameMap.grid[bushY][bushX] = TILE_TYPE.BUSHES;
            player.pendingHarvest.push({ x: bushX, y: bushY, type: TILE_TYPE.BUSHES });
        }
    }

    player.state = PLAYER_STATE.MOVING_TO_LOGS;
    player.targetX = player.actionTarget.x;
    player.targetY = player.actionTarget.y;
}

function beginHarvestingLogs(player) {
    player.state = PLAYER_STATE.HARVESTING_LOGS;
    player.actionTimer = 6;
    console.log(`[${player.username}] Began harvesting logs. Timestamp: ${Date.now()}`);
}

function finishHarvestingLogs(player, gameMap) {
    const numLogs = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numLogs; i++) {
        player.inventory.logs.push({ timestamp: Date.now() });
    }
    console.log(`[${player.username}] Harvested ${numLogs} logs. Total: ${player.inventory.logs.length}. Timestamp: ${Date.now()}`);
    player.addExperience('woodcutting', numLogs);
    player.addExperience('gathering', 2);
    gameMap.grid[player.actionTarget.y][player.actionTarget.x] = TILE_TYPE.GRASS;
    harvestNextBush(player, gameMap);
}

function harvestNextBush(player, gameMap) {
    if(player.pendingHarvest.length > 0) {
        player.actionTarget = player.pendingHarvest.shift();
        player.state = PLAYER_STATE.MOVING_TO_BUSHES;
        player.targetX = player.actionTarget.x;
        player.targetY = player.actionTarget.y;
    } else {
        findAndMoveToTree(player, gameMap);
    }
}

function beginHarvestingBushes(player) {
    player.state = PLAYER_STATE.HARVESTING_BUSHES;
    player.actionTimer = 2 + Math.random();
    console.log(`[${player.username}] Began harvesting bushes. Timestamp: ${Date.now()}`);
}

function finishHarvestingBushes(player, gameMap) {
    const numLeaves = Math.floor(200 + Math.random() * 801); 
    player.inventory.leaves.push({ amount: numLeaves, timestamp: Date.now() });
    const totalLeaves = player.inventory.leaves.reduce((sum, item) => sum + item.amount, 0);
    console.log(`[${player.username}] Harvested ${numLeaves} leaves. Total: ${totalLeaves}. Timestamp: ${Date.now()}`);
    player.addExperience('gathering', 1);
    gameMap.grid[player.actionTarget.y][player.actionTarget.x] = TILE_TYPE.GRASS;
    harvestNextBush(player, gameMap);
}

export function startChoppingCycle(player, gameMap) {
    console.log(`[${player.username}] Starting chopping cycle. Timestamp: ${Date.now()}`);
    findAndMoveToTree(player, gameMap);
}

export function findAndMoveToTree(player, gameMap) {
    const nearestTree = gameMap.findNearest(player.pixelX, player.pixelY, TILE_TYPE.TREE);
    if (nearestTree) {
        player.actionTarget = nearestTree;
        setChopTarget(player, gameMap, nearestTree);
    } else {
        console.log(`[${player.username}] No trees found.`);
        player.state = PLAYER_STATE.IDLE;
    }
}

export function setChopTarget(player, gameMap, treeCoords) {
    let bestSpot = null;
    let minDistance = Infinity;
    for(let dx = -1; dx <= 1; dx++) {
        for(let dy = -1; dy <= 1; dy++) {
            if(dx === 0 && dy === 0) continue;
            const spotX = treeCoords.x + dx;
            const spotY = treeCoords.y + dy;
            if(!gameMap.isColliding(spotX, spotY)) {
                const dist = (spotX - player.pixelX)**2 + (spotY - player.pixelY)**2;
                if(dist < minDistance) {
                   minDistance = dist;
                   bestSpot = {x: spotX, y: spotY};
                }
            }
        }
    }
    
    if(bestSpot) {
       player.targetX = bestSpot.x;
       player.targetY = bestSpot.y;
       player.state = PLAYER_STATE.MOVING_TO_TREE;
       console.log(`[${player.username}] Set target for tree at (${treeCoords.x}, ${treeCoords.y}). Moving to (${player.targetX}, ${player.targetY}).`);
    } else {
        console.log(`[${player.username}] Tree at (${treeCoords.x}, ${treeCoords.y}) is surrounded. Can't chop.`);
        player.state = PLAYER_STATE.IDLE;
    }
}

export function updateAction(player, deltaTime, gameMap) {
    const atMoveTarget = Math.round(player.pixelX) === player.targetX && Math.round(player.pixelY) === player.targetY;
    const atActionTarget = player.actionTarget && Math.round(player.pixelX) === player.actionTarget.x && Math.round(player.pixelY) === player.actionTarget.y;

    switch (player.state) {
        case PLAYER_STATE.IDLE:
            updateWander(player, deltaTime, gameMap);
            break;
        
        case PLAYER_STATE.MOVING_TO_TREE:
            updateMoveToTarget(player, deltaTime, gameMap);
            if (atMoveTarget) {
                beginChopping(player);
            }
            break;
        case PLAYER_STATE.MOVING_TO_LOGS:
        case PLAYER_STATE.MOVING_TO_BUSHES:
            updateMoveToTarget(player, deltaTime, gameMap);
            if (atActionTarget) {
                if (player.state === PLAYER_STATE.MOVING_TO_LOGS) beginHarvestingLogs(player);
                else if (player.state === PLAYER_STATE.MOVING_TO_BUSHES) beginHarvestingBushes(player);
            }
            break;

        case PLAYER_STATE.CHOPPING:
            player.actionTimer -= deltaTime;
            if (player.actionTimer <= 0) {
                finishChopping(player, gameMap);
            } else if (Math.floor(player.actionTimer) % 2 === 0 && Math.floor(player.actionTimer + deltaTime) % 2 !== 0) {
                 const chopSound = AudioManager.getBuffer('./chop.mp3');
                 AudioManager.play(chopSound);
            }
            break;
        
        case PLAYER_STATE.HARVESTING_LOGS:
            player.actionTimer -= deltaTime;
            if (player.actionTimer <= 0) {
                finishHarvestingLogs(player, gameMap);
            }
            break;

        case PLAYER_STATE.HARVESTING_BUSHES:
            player.actionTimer -= deltaTime;
            if (player.actionTimer <= 0) {
                finishHarvestingBushes(player, gameMap);
            }
            break;
    }
}