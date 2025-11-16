import { initTwitch } from './twitch.js';
import { Game } from './game.js';
import { AudioManager } from './audio-manager.js';

const connectContainer = document.getElementById('connect-container');
const gameContainer = document.getElementById('game-container');
const channelInput = document.getElementById('channel-input');
const connectBtn = document.getElementById('connect-btn');
const canvas = document.getElementById('game-canvas');

const STORAGE_KEY = 'twitch_channel_name';

function showGame() {
    connectContainer.classList.add('hidden');
    gameContainer.classList.remove('hidden');
}

function startGame(channel) {
    console.log(`Connecting to #${channel}...`);
    showGame();

    AudioManager.init();

    const game = new Game(canvas, channel);
    
    initTwitch(
        channel, 
        (chatter) => { // onChatter for energy
            game.addOrUpdatePlayer(chatter);
        },
        (userId, command) => { // onCommand
            game.handlePlayerCommand(userId, command);
        }
    );

    game.start();
}

connectBtn.addEventListener('click', () => {
    const channel = channelInput.value.trim().toLowerCase();
    if (channel) {
        localStorage.setItem(STORAGE_KEY, channel);
        startGame(channel);
    }
});

channelInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        connectBtn.click();
    }
});

// Load channel from localStorage on startup
const savedChannel = localStorage.getItem(STORAGE_KEY);
if (savedChannel) {
    channelInput.value = savedChannel;
}