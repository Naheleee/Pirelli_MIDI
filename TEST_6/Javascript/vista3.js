const wrapper = document.querySelector('.lettere');
const CONFIG = {
    rowCount: 4,
    letterCount: 9,
    letterGap: -30,
    minFontWidth: 100,
    maxFontWidth: 500
};
const rows = Array.from({ length: CONFIG.rowCount }, (_, index) => {
    const row = document.createElement('div');
    row.className = `lettere-riga letterelinea${index + 1}`;
    wrapper.appendChild(row);
    return row;
});
const spansByRow = rows.map(row =>
    Array.from({ length: CONFIG.letterCount }, () => {
        const span = document.createElement('span');
        span.className = 'lettera-singola';
        span.textContent = 'A';
        row.appendChild(span);
        return span;
    })
);
const spans = spansByRow[0];
let letterState = spans.map(() => ({ glyph: 'A', width: CONFIG.minFontWidth }));
let currentFontFamily = 'PirelliVar';
let fontsReady = false;

function getWaveWidths(crest) {
    return spans.map((_, index) => {
        if (index === crest) return CONFIG.maxFontWidth;
        const distanceToEdge = index < crest ? crest : spans.length - 1 - crest;
        const distanceFromCrest = Math.abs(index - crest);
        return CONFIG.maxFontWidth -
            (CONFIG.maxFontWidth - CONFIG.minFontWidth) * distanceFromCrest / distanceToEdge;
    });
}

function getFittedFontSize(widths, fontFamily, targetFontSize) {
    wrapper.style.fontFamily = `"${fontFamily}"`;
    spansByRow.forEach(rowSpans => {
        rowSpans.forEach((span, index) => {
            span.style.fontVariationSettings = `"wdth" ${widths[index]}`;
        });
    });

    let low = 1;
    let high = targetFontSize;
    for (let iteration = 0; iteration < 30; iteration++) {
        const size = (low + high) / 2;
        wrapper.style.fontSize = `${size}px`;
        const width = spans.reduce((total, span) => total + span.getBoundingClientRect().width, 0) +
            CONFIG.letterGap * (spans.length - 1);
        const letterHeight = Math.max(...spans.map(span => span.getBoundingClientRect().height));
        if (width <= rows[0].clientWidth && letterHeight <= rows[0].clientHeight) low = size;
        else high = size;
    }
    return low;
}

function fitText() {
    if (!fontsReady || !rows[0].clientWidth || !rows[0].clientHeight) return;
    const targetFontSize = Number.parseFloat(getComputedStyle(wrapper).fontSize);
    spansByRow.forEach(rowSpans => {
        rowSpans.forEach((span, index) => {
            span.style.marginLeft = index === 0 ? '0px' : `${CONFIG.letterGap}px`;
        });
    });
    let fittedFontSize = Infinity;
    for (const fontFamily of ['PirelliVar', 'PirelliStencil']) {
        for (let center = 0; center < spans.length; center++) {
            fittedFontSize = Math.min(
                fittedFontSize,
                getFittedFontSize(getWaveWidths(center), fontFamily, targetFontSize)
            );
        }
    }

    wrapper.style.fontFamily = `"${currentFontFamily}"`;
    wrapper.style.fontSize = `${fittedFontSize}px`;
    applyLetterState();
}

function applyLetterState() {
    spansByRow.forEach(rowSpans => {
        rowSpans.forEach((span, index) => {
            const letter = letterState[index];
            span.textContent = letter.glyph;
            span.style.fontVariationSettings =
                `"wdth" ${Math.max(CONFIG.minFontWidth, Math.min(CONFIG.maxFontWidth, letter.width))}`;
        });
    });
}

window.addEventListener('message', event => {
    if (event.source !== window.parent) return;
    if (
        event.origin !== window.location.origin &&
        !(window.location.protocol === 'file:' && event.origin === 'null')
    ) return;
    const data = event.data;
    if (
        data?.type !== 'lettere-state' ||
        !Array.isArray(data.letters) ||
        data.letters.length !== CONFIG.letterCount ||
        !['PirelliVar', 'PirelliStencil'].some(fontFamily =>
            typeof data.fontFamily === 'string' && data.fontFamily.includes(fontFamily)
        )
    ) return;

    const letters = data.letters;
    if (letters.some(letter =>
        !letter ||
        typeof letter.glyph !== 'string' ||
        Array.from(letter.glyph).length !== 1 ||
        !Number.isFinite(letter.width) ||
        letter.width < CONFIG.minFontWidth ||
        letter.width > CONFIG.maxFontWidth
    )) return;

    letterState = letters.map(({ glyph, width }) => ({ glyph, width }));
    const nextFontFamily = data.fontFamily.includes('PirelliStencil')
        ? 'PirelliStencil'
        : 'PirelliVar';
    if (currentFontFamily !== nextFontFamily) {
        currentFontFamily = nextFontFamily;
        document.fonts.load(`16px "${currentFontFamily}"`, 'A')
            .then(fitText)
            .catch(error => console.error('Failed to load the letter canvas font:', error));
    } else {
        applyLetterState();
    }
});

window.addEventListener('resize', fitText);
Promise.all([
    document.fonts.load('16px "PirelliVar"', 'A'),
    document.fonts.load('16px "PirelliStencil"', 'A')
]).then(() => {
    fontsReady = true;
    fitText();
}).catch(error => {
    console.error('Failed to load the letter canvas fonts:', error);
});
