const ablyClient = new Ably.Realtime("xO6zTg.qhdvvA:VBoolt4nyrt_7TIdvV9stu_2dQ4SirK-bgkR4Buys-0");
const messageOutput = document.querySelector('.font-info2');
const styleStatus = document.querySelector('.style-status');

function watchMidiDeviceStatus(channelName, statusElement) {
    const presence = ablyClient.channels.get(channelName).presence;
    const members = new Set();
    const queuedEvents = [];
    let snapshotLoaded = false;

    function updateStatus() {
        statusElement.textContent = members.size > 0 ? 'Connected' : 'OFF';
    }

    function applyPresenceEvent(action, member) {
        const memberId = `${member.connectionId}:${member.clientId}`;
        if (action === 'enter' || action === 'update') members.add(memberId);
        else if (action === 'leave') members.delete(memberId);
        updateStatus();
    }

    for (const action of ['enter', 'update', 'leave']) {
        presence.subscribe(action, member => {
            if (!snapshotLoaded) queuedEvents.push([action, member]);
            else applyPresenceEvent(action, member);
        });
    }

    presence.get().then(currentMembers => {
        currentMembers.forEach(member => {
            members.add(`${member.connectionId}:${member.clientId}`);
        });
        snapshotLoaded = true;
        queuedEvents.forEach(([action, member]) => applyPresenceEvent(action, member));
        queuedEvents.length = 0;
        updateStatus();
    }).catch(error => {
        console.error(`Failed to read ${channelName} MIDI presence:`, error);
    });
}

document.querySelectorAll('.midi-device-status').forEach(statusElement => {
    watchMidiDeviceStatus(statusElement.dataset.channel, statusElement);
});

function prependKeyMessage(message) {
    messageOutput.textContent = messageOutput.textContent
    ? `${message} / ${messageOutput.textContent}`
    : message;
}

function formatKeyboardNote(note) {
    const noteNames = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
    return `KB:"${noteNames[note % 12]}${Math.floor(note / 12) - 1}"`;
}

const letter = document.querySelector('.lettera');
const widthStatus = document.querySelector('.width-status');
const widthGuides = [
    document.querySelector('.width-guide-left'),
    document.querySelector('.width-guide-right')
];
const typeGuides = new Map(
    Array.from(document.querySelectorAll('.type-guide'), guide => [
        guide.dataset.metric,
        guide
    ])
);
const guideContainer = document.querySelector('.type-guides');
const widthValue = document.querySelector('.width-value');
const widthValues = new Map();
const launchpadWidth = { firstPad: 81, lastPad: 88, min: 100, max: 500 };
let currentFontWidth = launchpadWidth.max;
let renderedFontWidth = currentFontWidth;
let widthAnimationFrame = null;
const widthTransitionDuration = 620;
letter.style.fontVariationSettings = `"wdth" ${currentFontWidth}`;
widthStatus.textContent = String(currentFontWidth);
const widthProbe = document.createElement('span');
widthProbe.textContent = letter.textContent;
widthProbe.setAttribute('aria-hidden', 'true');
widthProbe.style.cssText =
    'position:fixed;left:-10000px;top:0;display:inline-block;visibility:hidden;white-space:pre;margin:0;padding:0;';
document.body.appendChild(widthProbe);

for (let pad = launchpadWidth.firstPad; pad <= launchpadWidth.lastPad; pad++) {
    const width = Math.round(
        launchpadWidth.min +
        (pad - launchpadWidth.firstPad) /
            (launchpadWidth.lastPad - launchpadWidth.firstPad) *
            (launchpadWidth.max - launchpadWidth.min)
    );
    widthValues.set(pad, width);
}

function setLetterWidth(width) {
    const targetWidth = Math.max(
        launchpadWidth.min,
        Math.min(launchpadWidth.max, width)
    );
    if (widthAnimationFrame !== null) {
        cancelAnimationFrame(widthAnimationFrame);
    }

    currentFontWidth = targetWidth;
    widthStatus.textContent = String(targetWidth);
    const startWidth = renderedFontWidth;
    let startTime = null;

    function animateWidth(time) {
        if (startTime === null) startTime = time;
        const progress = Math.min(1, (time - startTime) / widthTransitionDuration);
        const easedProgress = easeWidthTransition(progress);
        renderedFontWidth = startWidth + (targetWidth - startWidth) * easedProgress;
        letter.style.fontVariationSettings = `"wdth" ${renderedFontWidth}`;
        widthValue.textContent = String(Math.round(renderedFontWidth));
        updateWidthGuides(renderedFontWidth);

        if (progress < 1) {
            widthAnimationFrame = requestAnimationFrame(animateWidth);
        } else {
            renderedFontWidth = targetWidth;
            widthValue.textContent = String(targetWidth);
            updateWidthGuides(targetWidth);
            widthAnimationFrame = null;
        }
    }

    widthAnimationFrame = requestAnimationFrame(animateWidth);
}

function easeWidthTransition(progress) {
    const bezier = (t, first, second) =>
        3 * (1 - t) ** 2 * t * first +
        3 * (1 - t) * t ** 2 * second +
        t ** 3;
    let low = 0;
    let high = 1;
    let parameter = progress;

    for (let iteration = 0; iteration < 16; iteration++) {
        parameter = (low + high) / 2;
        if (bezier(parameter, 0.22, 0.36) < progress) low = parameter;
        else high = parameter;
    }
    return bezier(parameter, 1, 1);
}

const metricsContext = document.createElement('canvas').getContext('2d');
if (!metricsContext) throw new Error('Unable to create a canvas for font metrics.');

function updateWidthGuides(width) {
    const letterStyles = getComputedStyle(letter);
    widthProbe.style.fontFamily = letterStyles.fontFamily;
    widthProbe.style.fontSize = letterStyles.fontSize;
    widthProbe.style.fontWeight = letterStyles.fontWeight;
    widthProbe.style.fontStyle = letterStyles.fontStyle;
    widthProbe.style.fontVariationSettings = `"wdth" ${width}`;
    widthProbe.style.letterSpacing = letterStyles.letterSpacing;

    const letterBounds = letter.getBoundingClientRect();
    const guidesBounds = document.querySelector('.type-guides').getBoundingClientRect();
    const glyphWidth = widthProbe.getBoundingClientRect().width;
    const glyphCenter = letterBounds.left + letterBounds.width / 2 - guidesBounds.left;
    const halfWidth = glyphWidth / 2;
    const leftEdge = glyphCenter - halfWidth;
    const rightEdge = glyphCenter + halfWidth;
    widthGuides[0].style.left = `${leftEdge}px`;
    widthGuides[1].style.left = `${rightEdge}px`;
    widthValue.textContent = String(Math.round(width));
    const valueWidth = widthValue.getBoundingClientRect().width;
    const labelLeft = Math.min(
        rightEdge + 4,
        guidesBounds.width - valueWidth - 2
    );
    widthValue.style.setProperty('--width-label-x', `${Math.max(2, labelLeft)}px`);
}

function updateTypeGuides() {
    const letterStyles = getComputedStyle(letter);
    const fontSize = Number.parseFloat(letterStyles.fontSize);
    const letterBounds = letter.getBoundingClientRect();
    const guidesBounds = document.querySelector('.type-guides').getBoundingClientRect();
    metricsContext.font = `${letterStyles.fontStyle} ${letterStyles.fontWeight} ${fontSize}px ${letterStyles.fontFamily}`;

    const fontMetrics = metricsContext.measureText('A');
    const ascent = fontMetrics.fontBoundingBoxAscent || fontSize * 0.8;
    const descent = fontMetrics.fontBoundingBoxDescent || fontSize * 0.2;
    const baseline = letterBounds.top - guidesBounds.top +
        (letterBounds.height - ascent - descent) / 2 + ascent;
    const metricScale = fontSize / 1000;
    const positions = {
        'typo-ascender': baseline - 960 * metricScale,
        'cap-height': baseline - 720 * metricScale,
        'x-height': baseline - 432 * metricScale,
        baseline,
        'typo-descender': baseline + 240 * metricScale
    };

    const guideHeight = guideContainer.clientHeight;
    const displayedPositions = {};
    for (const [metric, position] of Object.entries(positions)) {
        const displayedPosition = Math.max(0, Math.min(guideHeight - 1, position));
        displayedPositions[metric] = displayedPosition;
        const guide = typeGuides.get(metric);
        guide.style.setProperty('--guide-y', `${displayedPosition}px`);
        const metricValue = {
            'typo-ascender': 960,
            'cap-height': 720,
            'x-height': 432,
            baseline: 0,
            'typo-descender': -240
        }[metric];
        guide.querySelector('.guide-value').textContent = String(metricValue);
    }
    guideContainer.style.setProperty(
        '--width-top',
        `${displayedPositions['typo-ascender']}px`
    );
    guideContainer.style.setProperty(
        '--width-label-y',
        `${displayedPositions['typo-ascender'] + 3}px`
    );
    guideContainer.style.setProperty(
        '--width-height',
        `${displayedPositions['typo-descender'] - displayedPositions['typo-ascender']}px`
    );
}

document.fonts.load('16px "PirelliVar"', 'AHx')
    .then(() => requestAnimationFrame(() => {
        updateTypeGuides();
        updateWidthGuides(currentFontWidth);
    }))
    .catch(error => console.error('Failed to load Pirelli font metrics:', error));
window.addEventListener('resize', () => {
    updateTypeGuides();
    updateWidthGuides(renderedFontWidth);
});

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
        if (data.isDown) {
            prependKeyMessage(`LP:"BTN${data.id}"`);
            const width = widthValues.get(data.id);
            if (width !== undefined) setLetterWidth(width);
        }
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
const segmentNotes = [
    ['Do2', 'Re2'], ['Mi2', 'Fa2'], ['Sol2', 'La2'],
    ['Si2', 'Do3'], ['Re3', 'Mi3'], ['Fa3', 'Sol3'],
    ['La3', 'Si3'], ['Do4', 'Re4'], ['Mi4', 'Fa4']
];
const visualizerBottom = document.querySelector('.note-visualizer');
const visualizerSegments = Array.from({ length: count }, (_, index) => {
    const segment = document.createElement('div');
    segment.className = 'audio-visualizer-segment';
    segment.textContent = segmentNotes[index].join('\n');
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
let fontChangeRequest = 0;
const looperSquares = Array.from(document.querySelectorAll('.looper-square'));
let activeLooperBeat = 0;

function advanceLooper() {
    looperSquares.forEach((square, index) => {
        square.classList.toggle('active', index === activeLooperBeat);
    });
    activeLooperBeat = (activeLooperBeat + 1) % looperSquares.length;
}

if (looperSquares.length > 0) {
    advanceLooper();
    window.setInterval(advanceLooper, 60000 / 70);
}

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
                updateTypeGuides();
                updateWidthGuides(currentFontWidth);
                styleStatus.textContent = data.fontFamily === 'PirelliStencil'
                    ? 'Stencil'
                    : 'Regular';
            }
        });
    }
});