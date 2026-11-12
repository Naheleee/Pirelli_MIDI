const receiverClientId = `receiver-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const localRealtime = new LocalRealtime({
    clientId: receiverClientId
});
const letterCycleChannel = localRealtime.channels.get('letter-cycle');
const letterCyclePresence = letterCycleChannel.presence;
const handTrackingChannel = localRealtime.channels.get('handtracking-vista2');
const keyboardChannel = localRealtime.channels.get('keyboard');
const launchpadChannel = localRealtime.channels.get('launchpad');
const receiverAudioChannel = localRealtime.channels.get('receiver-audio');
let lastHandTrackingPublish = 0;
let letterCycleLeaderId = null;
let letterCycleElection = 0;
let letterCycleInterval = null;

window.addEventListener('handtracking-results', event => {
    const now = performance.now();
    if (now - lastHandTrackingPublish < 50) return;
    lastHandTrackingPublish = now;
    handTrackingChannel.publish('fingertips', event.detail).catch(error => {
        console.error('Failed to publish hand tracking results:', error);
    });
});

const loadingOverlay = document.querySelector('.loading-overlay');
const loadingFrame = loadingOverlay.querySelector('iframe');
const loadingCompleteSound = document.querySelector('.loading-complete-sound');
const vistaOverlay = document.querySelector('.vista-overlay');
const vistaFrame = vistaOverlay.querySelector('iframe');
const isLocalFilePage = window.location.protocol === 'file:';
const loadingMessageTargetOrigin = isLocalFilePage ? '*' : window.location.origin;
const vistaMessageTargetOrigin = isLocalFilePage ? '*' : window.location.origin;
let loadingSequenceStarted = false;
let loadingSequenceFinished = false;
let loadingCompletionTimeout = null;
const loadingCompletionHoldMs = 2000;
let activeVista = null;
let vista3ClosePending = false;
let launchpadBlinkRequested = false;

window.addEventListener('loading-overlay-dismissed', () => {
    receiverAudioChannel.publish('loading-complete', {
        receiverId: receiverClientId
    }).catch(error => {
        console.error('Failed to notify the looper that loading completed:', error);
    });
});

receiverAudioChannel.subscribe('play-sfx', message => {
    if (
        message.data?.receiverId !== receiverClientId ||
        message.data?.sound !== 'loaded'
    ) return;

    loadingCompleteSound.currentTime = 0;
    loadingCompleteSound.play().catch(error => {
        console.error('Failed to play loading completion sound:', error);
    });
});

function publishLaunchpadLedState(id, velocity) {
    launchpadChannel.publish('led', { id, velocity }).catch(error => {
        console.error('Failed to publish Launchpad LED state:', error);
    });
}

function setLaunchpadLoadingBlink(isActive, options = {}) {
    if (
        launchpadBlinkRequested === isActive &&
        options.durationMs === undefined &&
        !options.reset
    ) return;
    launchpadBlinkRequested = isActive;
    launchpadChannel.publish('led', {
        type: 'loading-blink',
        isActive,
        ...options
    }).catch(error => {
        console.error('Failed to update Launchpad loading lights:', error);
    });
}

function updateLaunchpadSceneLights() {
    [1, 2, 3].forEach((vista, index) => {
        const id = 92 + index;
        const isActive = activeVista === vista;
        const pad = document.querySelector(`.launchpad-pad[data-id="${id}"]`);
        if (pad) {
            pad.classList.toggle('lit', isActive);
            pad.classList.remove('pressed');
        }
        publishLaunchpadLedState(id, isActive ? 9 : 0);
    });
}

updateLaunchpadSceneLights();

function startLoadingSequence() {
    window.dispatchEvent(new CustomEvent('loading-animation-cancelled'));
    vista3ClosePending = false;
    vistaOverlay.hidden = true;
    vistaOverlay.classList.remove('is-visible', 'is-ready');
    vistaFrame.src = 'about:blank';
    activeVista = null;
    updateLaunchpadSceneLights();
    setLaunchpadLoadingBlink(false, { reset: true });

    if (loadingCompletionTimeout !== null) {
        window.clearTimeout(loadingCompletionTimeout);
        loadingCompletionTimeout = null;
    }

    loadingSequenceStarted = true;
    loadingSequenceFinished = false;
    loadingOverlay.classList.remove('is-ready', 'is-visible');
    loadingOverlay.hidden = false;
    loadingFrame.src = `Viste/loadingpage.html?run=${Date.now()}`;
}

function toggleVista(vista) {
    window.dispatchEvent(new CustomEvent('loading-animation-cancelled'));
    setLaunchpadLoadingBlink(false, { reset: true });

    if (loadingCompletionTimeout !== null) {
        window.clearTimeout(loadingCompletionTimeout);
        loadingCompletionTimeout = null;
    }

    loadingSequenceStarted = false;
    loadingSequenceFinished = true;
    loadingOverlay.hidden = true;
    loadingOverlay.classList.remove('is-visible', 'is-ready');
    loadingFrame.src = 'about:blank';

    if (activeVista === vista) {
        activeVista = null;
        updateLaunchpadSceneLights();
        if (vista === 3) {
            vista3ClosePending = true;
            vistaFrame.contentWindow.postMessage(
                { type: 'vista3-close' },
                vistaMessageTargetOrigin
            );
            return;
        }
        vistaOverlay.classList.remove('is-visible');
        return;
    }

    vista3ClosePending = false;
    activeVista = vista;
    updateLaunchpadSceneLights();
    vistaOverlay.classList.remove('is-visible', 'is-ready');
    vistaFrame.src = `Viste/vista${vista}.html?run=${Date.now()}`;
    vistaOverlay.hidden = false;
}

loadingFrame.addEventListener('load', () => {
    if (loadingSequenceStarted) {
        loadingFrame.contentWindow.postMessage({ type: 'start-loading-animation' }, loadingMessageTargetOrigin);
    }
});

vistaFrame.addEventListener('load', () => {
    if (vista3ClosePending) {
        vistaFrame.contentWindow.postMessage(
            { type: 'vista3-close' },
            vistaMessageTargetOrigin
        );
        return;
    }
    if (activeVista !== null && !vistaOverlay.hidden) {
        if (activeVista === 3) {
            syncLetterVista();
            return;
        }
        vistaOverlay.classList.add('is-ready');
        vistaOverlay.classList.add('is-visible');
    }
});

vistaOverlay.addEventListener('transitionend', event => {
    if (
        event.target !== vistaOverlay ||
        event.propertyName !== 'opacity' ||
        vistaOverlay.classList.contains('is-visible') ||
        activeVista !== null
    ) return;

    vistaOverlay.hidden = true;
    vistaOverlay.classList.remove('is-ready');
    vistaFrame.src = 'about:blank';
});

window.addEventListener('message', event => {
    if (
        event.origin !== window.location.origin &&
        !(isLocalFilePage && event.origin === 'null')
    ) return;

    if (event.source === vistaFrame.contentWindow) {
        if (event.data?.type === 'vista3-ready' && activeVista === 3 && !vistaOverlay.hidden) {
            vistaOverlay.classList.add('is-ready');
            vistaOverlay.classList.add('is-visible');
            vistaFrame.contentWindow.postMessage(
                { type: 'vista3-enter' },
                vistaMessageTargetOrigin
            );
            return;
        }

        if (
            event.data?.type === 'vista3-close-complete' &&
            vista3ClosePending &&
            activeVista === null
        ) {
            vista3ClosePending = false;
            vistaOverlay.classList.remove('is-visible');
            if (!vistaOverlay.classList.contains('is-ready')) {
                vistaOverlay.hidden = true;
                vistaFrame.src = 'about:blank';
            }
        }
        return;
    }

    if (
        event.source !== loadingFrame.contentWindow ||
        !loadingSequenceStarted
    ) return;

    if (event.data?.type === 'loading-animation-started') {
        window.dispatchEvent(new CustomEvent('loading-animation-started', {
            detail: {
                durationMs: Number.isFinite(event.data.durationMs) ? event.data.durationMs : 0
            }
        }));
        loadingOverlay.classList.add('is-ready');
        loadingOverlay.classList.add('is-visible');
        setLaunchpadLoadingBlink(true, {
            durationMs: Number.isFinite(event.data.durationMs) && event.data.durationMs > 0
                ? event.data.durationMs + loadingCompletionHoldMs
                : event.data.durationMs
        });
        return;
    }
    if (event.data?.type !== 'loading-animation-complete') return;
    window.dispatchEvent(new CustomEvent('loading-animation-complete'));

    if (loadingSequenceFinished) return;
    loadingSequenceFinished = true;

    loadingCompletionTimeout = window.setTimeout(() => {
        loadingOverlay.hidden = true;
        window.dispatchEvent(new CustomEvent('loading-overlay-dismissed'));
        setLaunchpadLoadingBlink(false, { reset: true });
        loadingCompletionTimeout = null;
    }, loadingCompletionHoldMs);
});

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

const audioVisualizerFrame = document.querySelector('.audio-visualizer iframe');
const audioReactiveCircles = document.querySelectorAll('.square1, .square2');
window.addEventListener('message', event => {
    const data = event.data;
    if (
        event.source !== audioVisualizerFrame.contentWindow ||
        (event.origin !== window.location.origin &&
            !(window.location.protocol === 'file:' && event.origin === 'null')) ||
        data?.type !== 'audio-volume' ||
        typeof data.level !== 'number' ||
        !Number.isFinite(data.level)
    ) return;

    const level = Math.max(0, Math.min(1, data.level));
    const scale = 1 + level / 7;
    audioReactiveCircles.forEach(circle => {
        circle.style.setProperty('--audio-scale', String(scale));
    });
});

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
    const presence = localRealtime.channels.get(channelName).presence;
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
const widthGuideDots = new Map(
    Array.from(typeGuides, ([metric, guide]) => [
        metric,
        Array.from({ length: 2 }, () => {
            const dot = document.createElement('i');
            dot.className = 'type-guide-dot';
            guide.appendChild(dot);
            return dot;
        })
    ])
);
const guideContainer = document.querySelector('.type-guides');
const widthValue = document.querySelector('.width-value');
const title = document.querySelector('.titolo');
const titleCell = title ? title.parentElement : null;
let titleFontReady = false;
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
    if (!titleFontReady || !title || !titleCell) return;
    const text = title.querySelector('text');
    if (!text) return;

    const { x, y, width, height } = text.getBBox();
    if (width <= 0 || height <= 0) return;
    title.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
}

const widthProbe = document.createElement('span');
widthProbe.textContent = letter.textContent;
widthProbe.setAttribute('aria-hidden', 'true');
widthProbe.style.cssText =
    'position:fixed;left:-10000px;top:0;display:inline-block;visibility:hidden;white-space:pre;margin:0;padding:0;';
document.body.appendChild(widthProbe);

function setLetterWidth(
    width,
    startWidth = renderedFontWidth,
    startAt = Date.now(),
    duration = widthTransitionDuration
) {
    const targetWidth = Math.round(Math.max(
        letterWidthRange.min,
        Math.min(letterWidthRange.max, width)
    ));
    if (widthAnimationFrame !== null) {
        cancelAnimationFrame(widthAnimationFrame);
    }

    currentFontWidth = targetWidth;
    updateWidthStatus(targetWidth);
    function animateWidth() {
        const progress = Math.min(
            1,
            Math.max(0, (Date.now() - startAt) / duration)
        );
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
    for (const dots of widthGuideDots.values()) {
        dots.forEach((dot, index) => {
            dot.style.left = `${leftEdge + glyphWidth * index / (dots.length - 1)}px`;
        });
    }
    widthValue.textContent = String(Math.round(width));
    widthValue.style.setProperty('--width-label-x', `${glyphCenter}px`);
    updateWidthLabelPosition();
}

function updateWidthLabelPosition() {
    const baselineGuide = typeGuides.get('baseline');
    const guideBounds = guideContainer.getBoundingClientRect();
    const baselineLabels = baselineGuide.querySelector('span').getBoundingClientRect();
    guideContainer.style.setProperty(
        '--width-label-y',
        `${baselineLabels.top - guideBounds.top}px`
    );
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
    updateWidthLabelPosition();
    guideContainer.style.setProperty(
        '--width-height',
        `${displayedPositions['typo-descender'] - displayedPositions['typo-ascender']}px`
    );
}

document.fonts.load('16px "PirelliVar"', 'AHx')
    .then(() => {
        titleFontReady = true;
        fitTitle();
        title?.classList.add('is-ready');
        requestAnimationFrame(() => {
            updateTypeGuides();
            updateWidthGuides(currentFontWidth);
        });
    })
    .catch(error => {
        console.error('Failed to load Pirelli font metrics:', error);
        titleFontReady = true;
        fitTitle();
        title?.classList.add('is-ready');
    });
window.addEventListener('resize', () => {
    fitText();
    updateTypeGuides();
    updateWidthGuides(renderedFontWidth);
});

(() => {
    const rows = [
        81, 71, 61, 51, 41, 31, 21, 11
    ];
    const pads = new Map();
    const matrix = document.querySelector('.launchpad-visualizer');

    function createPad(id) {
        const pad = document.createElement('div');
        pad.className = 'launchpad-pad';
        pad.dataset.id = String(id);
        pads.set(id, pad);
        matrix.appendChild(pad);
    }

    for (const base of rows) {
        for (let column = 0; column < 8; column++) createPad(base + column);
    }

    const studioPadIds = new Set(rows.flatMap(base =>
        Array.from({ length: 8 }, (_, column) => base + column)
    ));
    const omittedControlIds = new Set([
        91, 92, 93, 94, 95, 96, 97, 98,
        89, 79, 69, 59, 49, 39, 29, 19
    ]);
    const lastSenderSequences = new Map();
    const sequencedSenders = new Set();
    function isFreshSenderMessage(data, stream) {
        if (typeof data.senderId !== 'string') return true;
        if (Number.isInteger(data.sequence)) {
            let senderSequences = lastSenderSequences.get(data.senderId);
            if (!senderSequences) {
                senderSequences = new Map();
                lastSenderSequences.set(data.senderId, senderSequences);
            }
            const lastSequence = senderSequences.get(stream);
            if (lastSequence !== undefined && data.sequence <= lastSequence) return false;
            sequencedSenders.add(data.senderId);
            senderSequences.set(stream, data.sequence);
            return true;
        }
        return !sequencedSenders.has(data.senderId);
    }

    launchpadChannel.subscribe('midi', message => {
        const data = message.data;
        if (
            !data ||
            !Number.isInteger(data.id) ||
            typeof data.isDown !== 'boolean' ||
            !isFreshSenderMessage(data, 'midi')
        ) return;
        const pad = pads.get(data.id);
        if (!pad && !omittedControlIds.has(data.id)) return;
        const sceneControl = data.id >= 91 && data.id <= 94;
        if (pad) {
            pad.classList.toggle(
                'pressed',
                data.isDown && !sceneControl
            );
        }
        if (data.isDown) {
            prependKeyMessage(`LP:"BTN${data.id}"`);
            if (data.id === 91) startLoadingSequence();
            if (data.id === 92) toggleVista(1);
            if (data.id === 93) toggleVista(2);
            if (data.id === 94) toggleVista(3);
        }
    });

    const pendingLedUpdates = new Map();
    launchpadChannel.subscribe('led', message => {
        const data = message.data;
        if (!data) return;
        if (data?.type === 'animation-frame') {
            if (
                !Array.isArray(data.litIds) ||
                !data.litIds.every(id => Number.isInteger(id) && studioPadIds.has(id)) ||
                !isFreshSenderMessage(data, 'led')
            ) return;
            studioPadIds.forEach(id => {
                const pendingUpdate = pendingLedUpdates.get(id);
                if (pendingUpdate !== undefined) window.clearTimeout(pendingUpdate);
                pendingLedUpdates.delete(id);
                pads.get(id).classList.remove('lit');
            });
            const animatedPads = new Set(data.litIds);
            pads.forEach((pad, id) => {
                pad.classList.toggle('animated', animatedPads.has(id));
            });
            return;
        }
        if (data?.type === 'clear-animation') {
            if (!isFreshSenderMessage(data, 'led')) return;
            pads.forEach(pad => pad.classList.remove('animated'));
            return;
        }
        if (data?.type === 'pending-blink-frame') {
            if (
                !Array.isArray(data.padIds) ||
                !data.padIds.every(id => Number.isInteger(id) && studioPadIds.has(id)) ||
                typeof data.isOn !== 'boolean' ||
                !isFreshSenderMessage(data, 'led')
            ) return;
            const blinkingPads = new Set(data.padIds);
            studioPadIds.forEach(id => {
                const pad = pads.get(id);
                const isBlinking = blinkingPads.has(id);
                pad.classList.toggle('pending-blink', isBlinking);
                pad.classList.toggle('pending-blink-on', isBlinking && data.isOn);
            });
            return;
        }
        if (
            !data ||
            !Number.isInteger(data.id) ||
            !pads.has(data.id) ||
            (data.id >= 92 && data.id <= 94) ||
            !Number.isInteger(data.velocity) ||
            data.velocity < 0 ||
            data.velocity > 127 ||
            !isFreshSenderMessage(data, 'led')
        ) return;

        const pad = pads.get(data.id);
        const pendingUpdate = pendingLedUpdates.get(data.id);
        if (pendingUpdate !== undefined) {
            window.clearTimeout(pendingUpdate);
            pendingLedUpdates.delete(data.id);
        }

        const applyLedState = () => {
            pad.classList.toggle('lit', data.velocity > 0);
            pendingLedUpdates.delete(data.id);
        };
        const delayMs = Number.isFinite(data.delayMs) ? Math.max(0, data.delayMs) : 0;
        if (delayMs === 0) {
            applyLedState();
        } else {
            pendingLedUpdates.set(data.id, window.setTimeout(applyLedState, delayMs));
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
    sender2AnimationFirstNote: 36,
    sender2AnimationLastNote: 95,
    computerKeyboardFirstNote: 60,
    computerKeyboardLastNote: 95,
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
function syncLetterVista() {
    if (activeVista !== 3 || !vistaFrame.contentWindow) return;
    vistaFrame.contentWindow.postMessage({
        type: 'lettere-state',
        fontFamily: getComputedStyle(wrapper).fontFamily,
        letters: spans.map(span => {
            const width = getComputedStyle(span).fontVariationSettings.match(/[\d.]+/);
            return {
                glyph: span.textContent,
                width: width ? Number(width[0]) : CONFIG.minFontWidth
            };
        })
    }, window.location.protocol === 'file:' ? '*' : window.location.origin);
}
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
        metricsContext.font = `${size}px "${fontFamily}"`;
        const glyphMetrics = metricsContext.measureText('A');
        const letterHeight = Number.isFinite(glyphMetrics.actualBoundingBoxAscent) &&
            Number.isFinite(glyphMetrics.actualBoundingBoxDescent)
            ? glyphMetrics.actualBoundingBoxAscent + glyphMetrics.actualBoundingBoxDescent
            : size;
        if (
            width <= square.clientWidth - 1 &&
            letterHeight <= height - 1
        ) low = size;
        else high = size;
    }
    wrapper.style.fontSize = previousFontSize;
    wrapper.style.fontFamily = previousFontFamily;
    spans.forEach((span, index) => {
        span.style.fontVariationSettings = previousWidths[index];
    });
    return low;
}

function fitLetterRowToWidth() {
    const fontSize = Number.parseFloat(getComputedStyle(wrapper).fontSize);
    if (!Number.isFinite(fontSize) || !square.clientWidth) return;

    let scalableWidth = 0;
    let fixedWidth = 0;
    spans.forEach(span => {
        const styles = getComputedStyle(span);
        const padding = Number.parseFloat(styles.paddingLeft) +
            Number.parseFloat(styles.paddingRight);
        scalableWidth += span.getBoundingClientRect().width - padding;
        fixedWidth += padding + Number.parseFloat(styles.marginLeft);
    });

    const targetScalableWidth = square.clientWidth - 1 - fixedWidth;
    if (scalableWidth > 0 && targetScalableWidth > 0) {
        wrapper.style.fontSize = `${fontSize * targetScalableWidth / scalableWidth}px`;
    }
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
    fitLetterRowToWidth();
    updateLetterTrackDots();
}

let selectedGroup = count - 1;
let lettersReady = false;
let pendingMidiNote = null;
let pendingMidiSource = null;
let activeMidiNote = null;
let animationFrame = null;
let animationStart = 0;
let animationFrom = spans.map(() => CONFIG.minFontWidth);
let animationTo = getWaveWidths(selectedGroup);

function applyWidths(widths) {
    spans.forEach((span, index) => {
        span.style.fontVariationSettings = `'wdth' ${Math.max(CONFIG.minFontWidth, Math.min(CONFIG.maxFontWidth, widths[index]))}`;
    });
    fitLetterRowToWidth();
    syncLetterVista();
}

function animateFrame(time) {
    if (!animationStart) animationStart = time;
    const progress = Math.min(1, (time - animationStart) / CONFIG.transitionDurationMs);
    const eased = easing(progress);
    applyWidths(animationFrom.map((start, index) => start + (animationTo[index] - start) * eased));
    updateLetterTrackDots();
    if (progress < 1) animationFrame = requestAnimationFrame(animateFrame);
    else {
        animationFrame = null;
    }
}

const whitePitchClasses = new Set([0, 2, 4, 5, 7, 9, 11]);
const sender2WhiteKeyCount = Array.from(
    { length: CONFIG.sender2AnimationLastNote - CONFIG.sender2AnimationFirstNote + 1 },
    (_, index) => CONFIG.sender2AnimationFirstNote + index
).filter(midi => whitePitchClasses.has(midi % 12)).length;

function isSelectableNote(note, source) {
    const firstNote = source === 'computer'
        ? CONFIG.computerKeyboardFirstNote
        : CONFIG.midiFirstNote;
    const lastNote = source === 'computer'
        ? CONFIG.computerKeyboardLastNote
        : CONFIG.midiLastNote;
    return Number.isInteger(note) &&
        note >= firstNote &&
        note <= lastNote &&
        whitePitchClasses.has(note % 12);
}

function getGroupIndex(note, source) {
    const firstNote = source === 'computer'
        ? CONFIG.sender2AnimationFirstNote
        : CONFIG.midiFirstNote;
    let whiteKeysBefore = 0;
    for (let midi = firstNote; midi < note; midi++) {
        if (whitePitchClasses.has(midi % 12)) whiteKeysBefore++;
    }
    if (source !== 'computer') return Math.floor(whiteKeysBefore / 2);

    return Math.floor(whiteKeysBefore * count / sender2WhiteKeyCount);
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

function selectNote(note, source) {
    if (!isSelectableNote(note, source)) return;
    activeMidiNote = note;
    const group = getGroupIndex(note, source);
    setActiveSegment(group);
    if (!lettersReady) {
        pendingMidiNote = note;
        pendingMidiSource = source;
        return;
    }
    animateGroup(group);
}

function releaseNote(note, source) {
    if (!isSelectableNote(note, source) || activeMidiNote !== note) return;
    activeMidiNote = null;
    pendingMidiNote = null;
    pendingMidiSource = null;
    setActiveSegment(null);
}

Promise.all([
    document.fonts.load('16px "PirelliVar"', 'A'),
    document.fonts.load('16px "PirelliStencil"', 'A')
]).then(() => {
    fitText();
    lettersReady = true;
    if (pendingMidiNote !== null && activeMidiNote === pendingMidiNote) {
        animateGroup(getGroupIndex(pendingMidiNote, pendingMidiSource));
    } else applyWidths(animationTo);
    updateLetterTrackDots();
    pendingMidiNote = null;
    pendingMidiSource = null;
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
    const widthFrom = currentFontWidth;
    const widthStartedAt = Date.now();
    setLetterWidth(beatWidth, widthFrom, widthStartedAt, widthTransitionDuration);
    letterCycleChannel.publish('letter', {
        glyph: letter.textContent,
        beat: activeLooperBeat + 1,
        width: beatWidth,
        widthFrom,
        widthStartedAt,
        widthDuration: widthTransitionDuration
    }).catch(error => {
        console.error('Failed to publish the current letter animation:', error);
    });
    activeLooperBeat = (activeLooperBeat + 1) % looperSquares.length;
    looperHasStarted = true;
}

letterCycleChannel.subscribe('letter', message => {
    if (
        message.connectionId !== letterCycleLeaderId ||
        message.connectionId === localRealtime.connection.id
    ) return;

    const { glyph, beat, width, widthFrom, widthStartedAt, widthDuration } = message.data ?? {};
    if (
        typeof glyph !== 'string' ||
        Array.from(glyph).length !== 1 ||
        !Number.isInteger(beat) ||
        beat < 1 ||
        beat > looperWidths.length ||
        !Number.isFinite(width) ||
        !Number.isFinite(widthFrom) ||
        !Number.isFinite(widthStartedAt) ||
        !Number.isFinite(widthDuration) ||
        widthDuration <= 0
    ) return;

    letter.textContent = glyph;
    updateGlyphInfo(glyph);
    widthProbe.textContent = glyph;
    updateWidthGuides(renderedFontWidth);
    setLetterWidth(width, widthFrom, widthStartedAt, widthDuration);
    activeLooperBeat = beat % looperWidths.length;
    looperHasStarted = true;
    looperSquares.forEach((square, index) => {
        square.classList.toggle('active', index === beat - 1);
    });
});

async function electLetterCycleLeader() {
    const election = ++letterCycleElection;
    try {
        const members = await letterCyclePresence.get();
        if (election !== letterCycleElection) return;
        const receiverIds = Array.from(new Set(
            members
                .filter(member => member.data?.role === 'receiver')
                .map(member => member.connectionId)
        )).sort();
        letterCycleLeaderId = receiverIds[0] ?? null;

        if (letterCycleLeaderId === localRealtime.connection.id) {
            if (letterCycleInterval === null && looperSquares.length > 0) {
                advanceLooper();
                letterCycleInterval = window.setInterval(advanceLooper, 60000 / 70);
            }
        } else if (letterCycleInterval !== null) {
            window.clearInterval(letterCycleInterval);
            letterCycleInterval = null;
        }
    } catch (error) {
        console.error('Failed to elect the letter cycle source:', error);
    }
}

if (looperSquares.length > 0) {
    letterCyclePresence.subscribe('enter', electLetterCycleLeader);
    letterCyclePresence.subscribe('leave', electLetterCycleLeader);
    letterCyclePresence.enter({ role: 'receiver' })
        .then(electLetterCycleLeader)
        .catch(error => {
            console.error('Failed to join letter cycle presence:', error);
        });
}

keyboardChannel.subscribe('midi', message => {
    const data = message.data;
    if (data?.type === 'noteon') {
        const firstNote = data.source === 'computer'
            ? CONFIG.computerKeyboardFirstNote
            : CONFIG.midiFirstNote;
        const lastNote = data.source === 'computer'
            ? CONFIG.computerKeyboardLastNote
            : CONFIG.midiLastNote;
        if (
            Number.isInteger(data.note) &&
            data.note >= firstNote &&
            data.note <= lastNote
        ) prependKeyMessage(formatKeyboardNote(data.note));
        selectNote(data.note, data.source);
    }
    if (data?.type === 'noteoff') {
        releaseNote(data.note, data.source);
    }
    if (
        data?.type === 'fontchange' &&
        ['PirelliVar', 'PirelliStencil'].includes(data.fontFamily)
    ) {
        const request = ++fontChangeRequest;
        document.fonts.load(`16px "${data.fontFamily}"`, 'A').then(() => {
            if (request === fontChangeRequest) {
                wrapper.style.fontFamily = `"${data.fontFamily}"`;
                syncLetterVista();
                updateTypeGuides();
                updateWidthGuides(currentFontWidth);
                styleStatus.textContent = data.fontFamily === 'PirelliStencil'
                    ? 'Stencil'
                    : 'Regular';
            }
        });
    }
});