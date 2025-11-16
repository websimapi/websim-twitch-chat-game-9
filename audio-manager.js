const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const soundBuffers = new Map();

async function loadSound(url) {
    if (soundBuffers.has(url)) {
        return soundBuffers.get(url);
    }
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        soundBuffers.set(url, buffer);
        return buffer;
    } catch (error) {
        console.error(`Failed to load sound: ${url}`, error);
        return null;
    }
}

function playSound(buffer) {
    if (!buffer) return;
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
}

export const AudioManager = {
    async init() {
        const resumeAudio = () => {
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            document.body.removeEventListener('click', resumeAudio);
            document.body.removeEventListener('touchstart', resumeAudio);
        };
        document.body.addEventListener('click', resumeAudio);
        document.body.addEventListener('touchstart', resumeAudio);

        // Preload sounds
        await Promise.all([
            loadSound('./chop.mp3'),
            loadSound('./tree_fall.mp3')
        ]);
    },
    play: playSound,
    getBuffer: (url) => soundBuffers.get(url),
};

