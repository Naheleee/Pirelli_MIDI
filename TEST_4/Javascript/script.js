const ablyClient = new Ably.Realtime("xO6zTg.qhdvvA:VBoolt4nyrt_7TIdvV9stu_2dQ4SirK-bgkR4Buys-0");
const infoFrameObserver = new ResizeObserver(entries => {
    entries.forEach(({ target }) => {
        const svg = target.querySelector('svg');
        const path = svg.querySelector('path');
        const { width, height } = target.getBoundingClientRect();
        if (!width || !height) return;

        const inset = 0.5;
        const cut = Math.min(6, (width - inset * 2) / 2, (height - inset * 2) / 2);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        path.setAttribute(
            'd',
            `M ${inset + cut} ${inset} H ${width - inset - cut} ` +
                `L ${width - inset} ${inset + cut} V ${height - inset - cut} ` +
                `L ${width - inset - cut} ${height - inset} H ${inset + cut} ` +
                `L ${inset} ${height - inset - cut} V ${inset + cut} Z`
        );
    });
});
document.querySelectorAll('.info-data-frame').forEach(frame => infoFrameObserver.observe(frame));

const messageOutput = document.querySelector('.font-info2');
const styleStatus = document.querySelector('.style-status');
const messageTrack = document.createElement('span');
messageTrack.className = 'font-info2-track';
const messageHistory = document.createElement('span');
messageHistory.className = 'font-info2-history';
messageTrack.append(messageHistory);
messageOutput.replaceChildren(messageTrack);

const recentMessageTimes = [];

messageTrack.addEventListener('transitionend', event => {
    if (event.propertyName !== 'transform') return;
    messageTrack.style.transition = 'none';
    const outputRight = messageOutput.getBoundingClientRect().right;
    Array.from(messageHistory.children).forEach(entry => {
        if (entry.getBoundingClientRect().left >= outputRight) entry.remove();
    });
});

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
    const hadPreviousMessages = messageHistory.childElementCount > 0;
    const currentTransform = getComputedStyle(messageTrack).transform;
    const currentOffset = currentTransform === 'none'
        ? 0
        : new DOMMatrixReadOnly(currentTransform).m41;

    const entry = document.createElement('span');
    entry.className = 'font-info2-entry';
    const text = document.createElement('span');
    text.textContent = message;
    entry.append(text);
    if (messageHistory.childElementCount > 0) {
        const separator = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        separator.setAttribute('class', 'message-separator');
        separator.setAttribute('viewBox', '0 0 10 10');
        separator.setAttribute('aria-hidden', 'true');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', '5');
        dot.setAttribute('cy', '5');
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', '#F46404');
        separator.append(dot);
        entry.append(separator);
    }
    messageHistory.prepend(entry);
    const now = performance.now();
    while (recentMessageTimes.length && now - recentMessageTimes[0] > 2500) {
        recentMessageTimes.shift();
    }
    recentMessageTimes.push(now);
    const duration = Math.max(160, 420 - Math.min(recentMessageTimes.length - 1, 8) * 32);

    if (!hadPreviousMessages) {
        messageTrack.style.transition = 'none';
        messageTrack.style.transform = 'translate3d(0, 0, 0)';
        return;
    }

    const entryWidth = entry.getBoundingClientRect().width;
    messageTrack.style.transition = 'none';
    messageTrack.style.transform = `translate3d(${currentOffset - entryWidth}px, 0, 0)`;
    messageTrack.getBoundingClientRect();
    messageTrack.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    messageTrack.style.transform = 'translate3d(0, 0, 0)';
}

function formatKeyboardNote(note) {
    const noteNames = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
    return `KB:"${noteNames[note % 12]}${Math.floor(note / 12) - 1}"`;
}

const letter = document.querySelector('.lettera');
const glyphInfoFields = new Map(
    Array.from(document.querySelectorAll('[data-glyph-info]'), field => [
        field.dataset.glyphInfo,
        field
    ])
);
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
const title = document.querySelector('.titolo');
const titleCell = title ? title.parentElement : null;
const letterWidthRange = { min: 100, max: 500 };
let currentFontWidth = letterWidthRange.max;
let renderedFontWidth = currentFontWidth;
let widthAnimationFrame = null;
const widthTransitionDuration = 620;
const occasionalGlyphs = [...'@{©®ÆÜÝÿø#%!?Ω√€ńăÕ/'];
const occasionalGlyphChance = 0.25;
const specialUnicodeNames = new Map([
    ['@', 'Commercial At'],
    ['{', 'Left Curly Bracket'],
    ['©', 'Copyright Sign'],
    ['®', 'Registered Sign'],
    ['Æ', 'Latin Capital Letter AE'],
    ['Ü', 'Latin Capital Letter U With Diaeresis'],
    ['Ý', 'Latin Capital Letter Y With Acute'],
    ['ÿ', 'Latin Small Letter Y With Diaeresis'],
    ['ø', 'Latin Small Letter O With Stroke'],
    ['#', 'Number Sign'],
    ['%', 'Percent Sign'],
    ['!', 'Exclamation Mark'],
    ['?', 'Question Mark'],
    ['Ω', 'Ohm Sign'],
    ['√', 'Square Root'],
    ['€', 'Euro Sign'],
    ['ń', 'Latin Small Letter N With Acute'],
    ['ă', 'Latin Small Letter A With Breve'],
    ['Õ', 'Latin Capital Letter O With Tilde'],
    ['/', 'Solidus']
]);
const widthStatusProbe = document.createElement('span');
widthStatusProbe.setAttribute('aria-hidden', 'true');
widthStatusProbe.style.cssText =
    'position:fixed;left:-10000px;top:0;display:inline-block;visibility:hidden;white-space:pre;margin:0;padding:0;';
document.body.appendChild(widthStatusProbe);

function updateWidthStatus(width) {
    const text = String(width);
    widthStatus.textContent = text;
    const styles = getComputedStyle(widthStatus);
    widthStatusProbe.style.fontFamily = styles.fontFamily;
    widthStatusProbe.style.fontSize = styles.fontSize;
    widthStatusProbe.style.fontWeight = styles.fontWeight;
    widthStatusProbe.style.fontStyle = styles.fontStyle;
    widthStatusProbe.style.fontVariationSettings = styles.fontVariationSettings;
    widthStatusProbe.textContent = text;
    widthStatus.style.width = `${widthStatusProbe.getBoundingClientRect().width}px`;
}

letter.style.fontVariationSettings = `"wdth" ${currentFontWidth}`;
updateWidthStatus(currentFontWidth);

function updateGlyphInfo(glyph) {
    const codePoint = glyph.codePointAt(0);
    if (codePoint === undefined) return;

    glyphInfoFields.get('glyph-name').textContent = glyph;
    glyphInfoFields.get('unicode-name').textContent =
        codePoint >= 65 && codePoint <= 90
            ? `Latin Capital Letter ${glyph}`
            : specialUnicodeNames.get(glyph) ??
                `Unicode Character U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
    glyphInfoFields.get('unicode-decimal').textContent = String(codePoint);
    glyphInfoFields.get('unicode-hex').textContent =
        codePoint.toString(16).toUpperCase().padStart(4, '0');
    glyphInfoFields.get('html-entity').textContent =
        `&#x${codePoint.toString(16).toUpperCase()};`;
}

updateGlyphInfo(letter.textContent);

function fitTitle() {
    if (!title || !titleCell) return;
    const cellStyles = getComputedStyle(titleCell);
    const availableWidth = titleCell.clientWidth -
        parseFloat(cellStyles.paddingLeft) - parseFloat(cellStyles.paddingRight);
    const availableHeight = titleCell.clientHeight -
        parseFloat(cellStyles.paddingTop) - parseFloat(cellStyles.paddingBottom);
    if (availableWidth <= 0 || availableHeight <= 0) return;

    let low = 1;
    let high = availableHeight * 4;
    for (let iteration = 0; iteration < 30; iteration++) {
        const fontSize = (low + high) / 2;
        title.style.fontSize = `${fontSize}px`;
        const bounds = title.getBoundingClientRect();
        if (bounds.width <= availableWidth && bounds.height <= availableHeight) low = fontSize;
        else high = fontSize;
    }
    title.style.fontSize = `${low}px`;
}

fitTitle();
const widthProbe = document.createElement('span');
widthProbe.textContent = letter.textContent;
widthProbe.setAttribute('aria-hidden', 'true');
widthProbe.style.cssText =
    'position:fixed;left:-10000px;top:0;display:inline-block;visibility:hidden;white-space:pre;margin:0;padding:0;';
document.body.appendChild(widthProbe);

function setLetterWidth(width) {
    const targetWidth = Math.round(Math.max(
        letterWidthRange.min,
        Math.min(letterWidthRange.max, width)
    ));
    if (widthAnimationFrame !== null) {
        cancelAnimationFrame(widthAnimationFrame);
    }

    currentFontWidth = targetWidth;
    updateWidthStatus(targetWidth);
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
        fitTitle();
        updateTypeGuides();
        updateWidthGuides(currentFontWidth);
    }))
    .catch(error => console.error('Failed to load Pirelli font metrics:', error));
window.addEventListener('resize', () => {
    fitTitle();
    fitText();
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
        if (data.isDown) prependKeyMessage(`LP:"BTN${data.id}"`);
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
    transitionDurationMs: 1000
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
const letterTrack = document.querySelector('.letter-track');
const letterTrackDots = document.querySelector('.letter-track-dots');
const letterTrackMarkers = spans.map(() => {
    const dot = document.createElement('span');
    dot.className = 'letter-track-dot';
    const value = document.createElement('span');
    value.className = 'letter-track-value';
    dot.appendChild(value);
    letterTrackDots.appendChild(dot);
    return dot;
});

function updateLetterTrackDots() {
    if (!letterTrack || !letterTrackDots) return;
    const markerLayer = letterTrackDots.getBoundingClientRect();
    spans.forEach((span, index) => {
        const bounds = span.getBoundingClientRect();
        letterTrackMarkers[index].style.left = `${bounds.left + bounds.width / 2 - markerLayer.left}px`;
        const widthValue = getComputedStyle(span).fontVariationSettings.match(/[\d.]+/);
        letterTrackMarkers[index].firstElementChild.textContent = widthValue
            ? String(Math.round(Number(widthValue[0])))
            : '';
    });
}

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
    const previousWidths = spans.map(span => span.style.fontVariationSettings);
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
    spans.forEach((span, index) => {
        span.style.fontVariationSettings = previousWidths[index];
    });
    wrapper.style.fontSize = `${fittedFontSize}px`;
    updateLetterTrackDots();
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
    updateLetterTrackDots();
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
    updateLetterTrackDots();
    pendingMidiNote = null;
});
let fontChangeRequest = 0;
const looperSquares = Array.from(document.querySelectorAll('.looper-square'));
const handTrackingGlyph = document.querySelector('.glifo1');
let activeLooperBeat = 0;
let looperHasStarted = false;
let nextAlphabeticLetterCode = 'B'.charCodeAt(0);
const looperWidths = [100, 250, 350, 500];

function advanceLooper() {
    if (looperHasStarted && activeLooperBeat === 0) {
        const firstLetterCode = 'A'.charCodeAt(0);
        const lastLetterCode = 'Z'.charCodeAt(0);
        if (Math.random() < occasionalGlyphChance) {
            letter.textContent = occasionalGlyphs[
                Math.floor(Math.random() * occasionalGlyphs.length)
            ];
        } else {
            letter.textContent = String.fromCharCode(nextAlphabeticLetterCode);
            nextAlphabeticLetterCode = nextAlphabeticLetterCode >= lastLetterCode
                ? firstLetterCode
                : nextAlphabeticLetterCode + 1;
        }
        updateGlyphInfo(letter.textContent);
        widthProbe.textContent = letter.textContent;
        updateWidthGuides(renderedFontWidth);
    }

    looperSquares.forEach((square, index) => {
        square.classList.toggle('active', index === activeLooperBeat);
    });
    if (handTrackingGlyph) {
        handTrackingGlyph.style.fontFeatureSettings = `"ornm" ${activeLooperBeat + 1}`;
    }
    const beatWidth = looperWidths[activeLooperBeat] ?? letterWidthRange.min;
    setLetterWidth(beatWidth);
    activeLooperBeat = (activeLooperBeat + 1) % looperSquares.length;
    looperHasStarted = true;
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