const ablyClient = new Ably.Realtime("xO6zTg.qhdvvA:VBoolt4nyrt_7TIdvV9stu_2dQ4SirK-bgkR4Buys-0");
const messageOutput = document.querySelector('.font-info2');

function prependKeyMessage(message) {
    const formattedMessage = `"${message}"`;
    messageOutput.textContent = messageOutput.textContent
        ? `${formattedMessage} / ${messageOutput.textContent}`
        : formattedMessage;
}

function formatKeyboardNote(note) {
    const noteNames = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
    return `K:${noteNames[note % 12]}${Math.floor(note / 12) - 1}`;
}

(() => {
    const rows = [
        { base: 81, scene: 89 }, { base: 71, scene: 79 },
        { base: 61, scene: 69 }, { base: 51, scene: 59 },
        { base: 41, scene: 49 }, { base: 31, scene: 39 },
        { base: 21, scene: 29 }, { base: 11, scene: 19 }
    ];
    const pads = new Map();
    const matrix = document.querySelector('.launchpad-visualizer');

    function createPad(id, spacer = false) {
        const pad = document.createElement('div');
        pad.className = spacer ? 'launchpad-spacer' : 'launchpad-pad';
        if (!spacer) pads.set(id, pad);
        matrix.appendChild(pad);
    }

    for (let id = 91; id <= 98; id++) createPad(id);
    createPad(null, true);
    for (const row of rows) {
        for (let column = 0; column < 8; column++) createPad(row.base + column);
        createPad(row.scene);
    }

    ablyClient.channels.get('launchpad').subscribe('midi', message => {
        const data = message.data;
        if (!data || !Number.isInteger(data.id) || typeof data.isDown !== 'boolean') return;
        const pad = pads.get(data.id);
        if (!pad) return;
        pad.classList.toggle('active', data.isDown);
        if (data.isDown) prependKeyMessage(`L:tn${data.id}`);
    });
})();

const square = document.querySelector('.box5');
const wrapper = document.querySelector('.lettere');
const CONFIG = {
    letterCount: 9,
    letterGap: -30,
    minFontWidth: 100,
    maxFontWidth: 500,
    midiFirstNote: 36,
    midiLastNote: 65,
    transitionDurationMs: 620
};
const count = CONFIG.letterCount;
const visualizerBottom = document.querySelector('.audio-visualizer-bottom');
const visualizerSegments = Array.from({ length: count }, () => {
    const segment = document.createElement('div');
    segment.className = 'audio-visualizer-segment';
    visualizerBottom.appendChild(segment);
    return segment;
});
const spans = Array.from({ length: count }, () => {
    const span = document.createElement('span');
    span.className = 'lettera-singola';
    span.textContent = 'A';
    wrapper.appendChild(span);
    return span;
});
const easing = progress => 1 - (1 - progress) ** 3;

function getWaveWidths(crest) {
    return spans.map((_, index) => {
        if (index === crest) return CONFIG.maxFontWidth;
        const distanceToEdge = index < crest ? crest : count - 1 - crest;
        const distanceFromCrest = Math.abs(index - crest);
        return CONFIG.maxFontWidth -
            (CONFIG.maxFontWidth - CONFIG.minFontWidth) * distanceFromCrest / distanceToEdge;
    });
}

function getFittedFontSize(widths, fontFamily) {
    const height = square.clientHeight;
    if (!square.clientWidth || !height) return 0;
    const previousFontSize = wrapper.style.fontSize;
    const previousFontFamily = wrapper.style.fontFamily;
    const previousWidths = spans.map(span => span.style.fontVariationSettings);
    wrapper.style.fontFamily = `"${fontFamily}"`;
    spans.forEach((span, index) => {
        span.style.fontVariationSettings = `'wdth' ${widths[index]}`;
    });
    let low = 1;
    let high = height * 4;
    for (let iteration = 0; iteration < 30; iteration++) {
        const size = (low + high) / 2;
        wrapper.style.fontSize = `${size}px`;
        const width = spans.reduce((total, span) => total + span.getBoundingClientRect().width, 0) +
            CONFIG.letterGap * (count - 1);
        const letterHeight = Math.max(...spans.map(span => span.getBoundingClientRect().height));
        if (width <= square.clientWidth && letterHeight <= height) low = size;
        else high = size;
    }
    wrapper.style.fontSize = previousFontSize;
    wrapper.style.fontFamily = previousFontFamily;
    spans.forEach((span, index) => {
        span.style.fontVariationSettings = previousWidths[index];
    });
    return low;
}

function fitText() {
    wrapper.style.width = '100%';
    spans.forEach((span, index) => {
        span.style.marginLeft = index === 0 ? '0px' : `${CONFIG.letterGap}px`;
        span.style.fontVariationSettings = `'wdth' ${CONFIG.minFontWidth}`;
    });
    let fittedFontSize = Infinity;
    for (const fontFamily of ['PirelliVar', 'PirelliStencil']) {
        for (let center = 0; center < count; center++) {
            fittedFontSize = Math.min(
                fittedFontSize,
                getFittedFontSize(getWaveWidths(center), fontFamily)
            );
        }
    }
    wrapper.style.fontSize = `${fittedFontSize}px`;
}

let selectedGroup = count - 1;
let lettersReady = false;
let pendingMidiNote = null;
let activeMidiNote = null;
let animationFrame = null;
let animationStart = 0;
let animationFrom = spans.map(() => CONFIG.minFontWidth);
let animationTo = getWaveWidths(selectedGroup);

function applyWidths(widths) {
    spans.forEach((span, index) => {
        span.style.fontVariationSettings = `'wdth' ${Math.max(CONFIG.minFontWidth, Math.min(CONFIG.maxFontWidth, widths[index]))}`;
    });
}

function animateFrame(time) {
    if (!animationStart) animationStart = time;
    const progress = Math.min(1, (time - animationStart) / CONFIG.transitionDurationMs);
    const eased = easing(progress);
    applyWidths(animationFrom.map((start, index) => start + (animationTo[index] - start) * eased));
    if (progress < 1) animationFrame = requestAnimationFrame(animateFrame);
    else animationFrame = null;
}

const whitePitchClasses = new Set([0, 2, 4, 5, 7, 9, 11]);

function isSelectableNote(note) {
    return Number.isInteger(note) &&
        note >= CONFIG.midiFirstNote &&
        note <= CONFIG.midiLastNote &&
        whitePitchClasses.has(note % 12);
}

function getGroupIndex(note) {
    let whiteKeysBefore = 0;
    for (let midi = CONFIG.midiFirstNote; midi < note; midi++) {
        if (whitePitchClasses.has(midi % 12)) whiteKeysBefore++;
    }
    return Math.floor(whiteKeysBefore / 2);
}

function setActiveSegment(group) {
    visualizerSegments.forEach((segment, index) => {
        segment.classList.toggle('active', index === group);
    });
}

function animateGroup(group) {
    selectedGroup = group;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrom = spans.map(span => {
        const match = getComputedStyle(span).fontVariationSettings.match(/[\d.]+/);
        return match ? Number(match[0]) : CONFIG.minFontWidth;
    });
    animationTo = getWaveWidths(selectedGroup);
    animationStart = 0;
    animationFrame = requestAnimationFrame(animateFrame);
}

function selectNote(note) {
    if (!isSelectableNote(note)) return;
    activeMidiNote = note;
    const group = getGroupIndex(note);
    setActiveSegment(group);
    if (!lettersReady) {
        pendingMidiNote = note;
        return;
    }
    animateGroup(group);
}

function releaseNote(note) {
    if (!isSelectableNote(note) || activeMidiNote !== note) return;
    activeMidiNote = null;
    pendingMidiNote = null;
    setActiveSegment(null);
}

Promise.all([
    document.fonts.load('16px "PirelliVar"', 'A'),
    document.fonts.load('16px "PirelliStencil"', 'A')
]).then(() => {
    fitText();
    lettersReady = true;
    if (pendingMidiNote !== null && activeMidiNote === pendingMidiNote) {
        animateGroup(getGroupIndex(pendingMidiNote));
    } else applyWidths(animationTo);
    pendingMidiNote = null;
});
window.addEventListener('resize', fitText);
let fontChangeRequest = 0;
ablyClient.channels.get('keyboard').subscribe('midi', message => {
    const data = message.data;
    if (data?.type === 'noteon') {
        if (
            Number.isInteger(data.note) &&
            data.note >= CONFIG.midiFirstNote &&
            data.note <= CONFIG.midiLastNote
        ) prependKeyMessage(formatKeyboardNote(data.note));
        selectNote(data.note);
    }
    if (data?.type === 'noteoff') releaseNote(data.note);
    if (
        data?.type === 'fontchange' &&
        ['PirelliVar', 'PirelliStencil'].includes(data.fontFamily)
    ) {
        const request = ++fontChangeRequest;
        document.fonts.load(`16px "${data.fontFamily}"`, 'A').then(() => {
            if (request === fontChangeRequest) {
                wrapper.style.fontFamily = `"${data.fontFamily}"`;
            }
        });
    }
});