const ablyClient = new Ably.Realtime({
    key: 'xO6zTg.qhdvvA:VBoolt4nyrt_7TIdvV9stu_2dQ4SirK-bgkR4Buys-0',
    clientId: `vista2-${Date.now()}-${Math.random().toString(36).slice(2)}`
});

const glyphInfoFields = new Map(
    Array.from(document.querySelectorAll('[data-glyph-info]'), field => [
        field.dataset.glyphInfo,
        field
    ])
);
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

const looperSquares = Array.from(document.querySelectorAll('.looper-square'));
const handTrackingGlyph = document.querySelector('.glifo1');
const handTrackingCanvas = document.querySelector('.handtracking-canvas');
const handTrackingContext = handTrackingCanvas.getContext('2d');

if (!handTrackingContext) {
    throw new Error('Unable to create a canvas for hand tracking.');
}

ablyClient.channels.get('handtracking-vista2').subscribe('fingertips', message => {
    const hands = message.data?.hands;
    if (!Array.isArray(hands)) return;

    const validHands = hands.filter(hand =>
        Array.isArray(hand) &&
        hand.length === 5 &&
        hand.every(point =>
            point !== null &&
            typeof point === 'object' &&
            Number.isFinite(point.x) &&
            point.x >= 0 &&
            point.x <= 1 &&
            Number.isFinite(point.y) &&
            point.y >= 0 &&
            point.y <= 1
        )
    );

    handTrackingContext.save();
    handTrackingContext.clearRect(
        0,
        0,
        handTrackingCanvas.width,
        handTrackingCanvas.height
    );
    handTrackingContext.translate(handTrackingCanvas.width, 0);
    handTrackingContext.scale(-1, 1);
    handTrackingContext.fillStyle = '#1A1A1A';
    handTrackingContext.strokeStyle = '#F46404';
    handTrackingContext.lineWidth = 1.5;

    for (const hand of validHands) {
        for (const point of hand) {
            handTrackingContext.beginPath();
            handTrackingContext.arc(
                point.x * handTrackingCanvas.width,
                point.y * handTrackingCanvas.height,
                7,
                0,
                Math.PI * 2
            );
            handTrackingContext.fill();
            handTrackingContext.stroke();
        }
    }

    handTrackingContext.restore();
});

ablyClient.channels.get('letter-cycle').subscribe('letter', message => {
    const { glyph, beat } = message.data ?? {};
    if (typeof glyph === 'string' && Array.from(glyph).length === 1) {
        updateGlyphInfo(glyph);
    }
    if (!Number.isInteger(beat) || beat < 1 || beat > looperSquares.length) return;

    looperSquares.forEach((square, index) => {
        square.classList.toggle('active', index === beat - 1);
    });
    handTrackingGlyph.style.fontFeatureSettings = `"ornm" ${beat}`;
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

    const studioPadIds = new Set(rows.flatMap(({ base }) =>
        Array.from({ length: 8 }, (_, column) => base + column)
    ));
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

    ablyClient.channels.get('launchpad').subscribe('midi', message => {
        const data = message.data;
        if (
            !data ||
            !Number.isInteger(data.id) ||
            typeof data.isDown !== 'boolean' ||
            !isFreshSenderMessage(data, 'midi')
        ) return;
        const pad = pads.get(data.id);
        if (pad) pad.classList.toggle('pressed', data.isDown);
    });

    ablyClient.channels.get('launchpad').subscribe('led', message => {
        const data = message.data;
        if (!data) return;
        if (
            !Number.isInteger(data.id) ||
            !pads.has(data.id) ||
            !Number.isInteger(data.velocity) ||
            !isFreshSenderMessage(data, 'led')
        ) return;
        pads.get(data.id).classList.toggle('lit', data.velocity > 0);
    });

    ablyClient.channels.get('launchpad').subscribe('led', message => {
        const data = message.data;
        if (
            !data ||
            data.type !== 'animation-frame' ||
            !Array.isArray(data.litIds) ||
            !data.litIds.every(id => Number.isInteger(id) && studioPadIds.has(id)) ||
            !isFreshSenderMessage(data, 'led')
        ) return;
        studioPadIds.forEach(id => pads.get(id).classList.remove('lit'));
        const animatedPads = new Set(data.litIds);
        pads.forEach((pad, id) => pad.classList.toggle('animated', animatedPads.has(id)));
    });
})();
