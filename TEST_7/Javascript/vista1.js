const letter = document.querySelector('.lettera');
const localRealtime = new LocalRealtime(`vista1-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const letterCycleChannel = localRealtime.channels.get('letter-cycle');
const letterCyclePresence = letterCycleChannel.presence;
let letterCycleLeaderId = null;
let electionRequest = 0;
const guideContainer = document.querySelector('.type-guides');
const widthValue = document.querySelector('.width-value');
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
const widthProbe = document.createElement('span');
widthProbe.textContent = letter.textContent;
widthProbe.setAttribute('aria-hidden', 'true');
widthProbe.style.cssText =
    'position:fixed;left:-10000px;top:0;display:inline-block;visibility:hidden;white-space:pre;margin:0;padding:0;';
document.body.appendChild(widthProbe);

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
    const guidesBounds = guideContainer.getBoundingClientRect();
    const glyphWidth = widthProbe.getBoundingClientRect().width;
    const glyphCenter = letterBounds.left + letterBounds.width / 2 - guidesBounds.left;
    const leftEdge = glyphCenter - glyphWidth / 2;
    const rightEdge = glyphCenter + glyphWidth / 2;
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
    const guidesBounds = guideContainer.getBoundingClientRect();
    metricsContext.font =
        `${letterStyles.fontStyle} ${letterStyles.fontWeight} ${fontSize}px ${letterStyles.fontFamily}`;

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

const widthRange = { min: 100, max: 500 };
const looperWidths = [100, 250, 350, 500];
let renderedWidth = widthRange.max;
let widthGuideInterval = null;

function easeWidthTransition(progress) {
    const bezier = (time, first, second) =>
        3 * (1 - time) ** 2 * time * first +
        3 * (1 - time) * time ** 2 * second +
        time ** 3;
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

function setLetterWidth(width, startWidth, startAt, duration) {
    const targetWidth = Math.round(Math.max(
        widthRange.min,
        Math.min(widthRange.max, width)
    ));
    if (widthGuideInterval !== null) {
        window.clearInterval(widthGuideInterval);
        widthGuideInterval = null;
    }

    letter.style.transition = 'none';
    letter.style.transitionDelay = '0ms';
    function animateWidth() {
        const progress = Math.min(1, Math.max(0, (Date.now() - startAt) / duration));
        renderedWidth = startWidth +
            (targetWidth - startWidth) * easeWidthTransition(progress);
        letter.style.fontVariationSettings = `"wdth" ${renderedWidth}`;
        updateWidthGuides(renderedWidth);

        if (progress === 1) {
            window.clearInterval(widthGuideInterval);
            widthGuideInterval = null;
            renderedWidth = targetWidth;
            letter.style.fontVariationSettings = `"wdth" ${targetWidth}`;
            updateWidthGuides(targetWidth);
        }
    }

    animateWidth();
    if (Date.now() - startAt < duration) {
        widthGuideInterval = window.setInterval(animateWidth, 16);
    }
}

async function updateLetterCycleLeader() {
    const request = ++electionRequest;
    try {
        const members = await letterCyclePresence.get();
        if (request !== electionRequest) return;
        const receiverIds = Array.from(new Set(
            members
                .filter(member => member.data?.role === 'receiver')
                .map(member => member.connectionId)
        )).sort();
        letterCycleLeaderId = receiverIds[0] ?? null;
    } catch (error) {
        console.error('Failed to find the letter cycle source:', error);
    }
}

for (const action of ['enter', 'leave', 'update']) {
    letterCyclePresence.subscribe(action, updateLetterCycleLeader);
}
updateLetterCycleLeader();

letterCycleChannel.subscribe('letter', message => {
    if (message.connectionId !== letterCycleLeaderId) return;
    const { glyph, beat, width, widthFrom, widthStartedAt, widthDuration } = message.data ?? {};
    if (
        typeof glyph !== 'string' ||
        Array.from(glyph).length !== 1 ||
        !Number.isInteger(beat) ||
        beat < 1 ||
        beat > looperWidths.length ||
        !Number.isFinite(width) ||
        width < widthRange.min ||
        width > widthRange.max ||
        !Number.isFinite(widthFrom) ||
        widthFrom < widthRange.min ||
        widthFrom > widthRange.max ||
        !Number.isFinite(widthStartedAt) ||
        !Number.isFinite(widthDuration) ||
        widthDuration <= 0
    ) return;

    if (letter.textContent !== glyph) {
        letter.textContent = glyph;
        widthProbe.textContent = glyph;
        updateWidthGuides(renderedWidth);
    }
    setLetterWidth(width, widthFrom, widthStartedAt, widthDuration);
});

document.fonts.load('16px "PirelliVar"', 'AHx')
    .then(() => {
        updateTypeGuides();
        updateWidthGuides(renderedWidth);
    })
    .catch(error => {
        console.error('Failed to load Pirelli font metrics:', error);
    });

window.addEventListener('resize', () => {
    updateTypeGuides();
    updateWidthGuides(renderedWidth);
});
