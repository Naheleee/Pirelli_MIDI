const handTrackingVideo = document.querySelector('.handtracking-video');
const handTrackingCanvas = document.querySelector('.handtracking-canvas');
const handTrackingContext = handTrackingCanvas.getContext('2d');
const receiverHandTrackingCanvas = document.querySelector('.receiver-handtracking-overlay');
const receiverHandTrackingContext = receiverHandTrackingCanvas.getContext('2d');
const receiverHandTrackingLabels = document.querySelector('.receiver-handtracking-labels');
const fingertipIndices = [4, 8, 12, 16, 20];
const receiverFingertipLabels = Array.from({ length: 20 }, () => {
    const label = document.createElement('span');
    label.className = 'receiver-handtracking-label';
    label.hidden = true;
    receiverHandTrackingLabels.appendChild(label);
    return label;
});

if (!handTrackingContext || !receiverHandTrackingContext) {
    throw new Error('Unable to create a canvas for hand tracking.');
}

function resetCameraImageFilter() {
    handTrackingVideo.style.transition = 'none';
    handTrackingVideo.style.filter = '';
}

window.addEventListener('loading-animation-started', event => {
    const loadingDuration = Number.isFinite(event.detail.durationMs) && event.detail.durationMs > 0
        ? event.detail.durationMs
        : 0;
    const animationDuration = loadingDuration + 2000;
    handTrackingVideo.style.transition = 'none';
    handTrackingVideo.style.filter = 'brightness(0.06) saturate(0)';
    void getComputedStyle(handTrackingVideo).filter;
    handTrackingVideo.style.transition = `filter ${animationDuration}ms linear`;
    handTrackingVideo.style.filter = 'brightness(1) saturate(1)';
});

window.addEventListener('loading-overlay-dismissed', resetCameraImageFilter);
window.addEventListener('loading-animation-cancelled', resetCameraImageFilter);

function drawFingertips(context, canvas, landmarks, fillColor, strokeColor, radius = 7) {
    context.fillStyle = fillColor;
    if (strokeColor) {
        context.strokeStyle = strokeColor;
        context.lineWidth = 1.5;
    }

    for (const index of fingertipIndices) {
        const point = landmarks[index];
        context.beginPath();
        context.arc(
            point.x * canvas.width,
            point.y * canvas.height,
            radius,
            0,
            Math.PI * 2
        );
        context.fill();
        if (strokeColor) context.stroke();
    }
}

function getSquareCameraPoint(point) {
    const sourceWidth = handTrackingVideo.videoWidth || handTrackingCanvas.width;
    const sourceHeight = handTrackingVideo.videoHeight || handTrackingCanvas.height;
    const sourceAspect = sourceWidth / sourceHeight;
    const squareAspect = 1;
    const visibleWidth = sourceAspect > squareAspect ? squareAspect / sourceAspect : 1;
    const visibleHeight = sourceAspect < squareAspect ? sourceAspect / squareAspect : 1;
    const cropLeft = (1 - visibleWidth) / 2;
    const cropTop = (1 - visibleHeight) / 2;
    const mirroredX = 1 - point.x;
    const x = (mirroredX - cropLeft) / visibleWidth;
    const y = (point.y - cropTop) / visibleHeight;

    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return {
        x: x * receiverHandTrackingCanvas.width,
        y: y * receiverHandTrackingCanvas.height
    };
}

function drawReceiverHandTracking(detectedHands) {
    const canvas = receiverHandTrackingCanvas;
    const context = receiverHandTrackingContext;
    context.clearRect(0, 0, canvas.width, canvas.height);
    let labelIndex = 0;

    detectedHands.forEach(landmarks => {
        fingertipIndices.forEach(index => {
            const label = receiverFingertipLabels[labelIndex++];
            const point = getSquareCameraPoint(landmarks[index]);
            if (!point) {
                label.hidden = true;
                return;
            }

            context.beginPath();
            context.arc(point.x, point.y, 4, 0, Math.PI * 2);
            context.fillStyle = '#F46404';
            context.fill();

            label.textContent = `X ${Math.round(point.x)}\nY ${Math.round(point.y)}`;
            label.style.left = `${(point.x / canvas.width) * 100}%`;
            label.style.top = `${(point.y / canvas.height) * 100}%`;
            label.style.transform = 'translate(-50%, 6px)';
            label.hidden = false;
        });
    });

    receiverFingertipLabels.slice(labelIndex).forEach(label => {
        label.hidden = true;
    });
}

function showHandTrackingResults(results) {
    const detectedHands = results.multiHandLandmarks ?? [];
    handTrackingContext.save();
    handTrackingContext.clearRect(0, 0, handTrackingCanvas.width, handTrackingCanvas.height);
    handTrackingContext.translate(handTrackingCanvas.width, 0);
    handTrackingContext.scale(-1, 1);
    detectedHands.forEach(landmarks =>
        drawFingertips(handTrackingContext, handTrackingCanvas, landmarks, '#1A1A1A', '#F46404', 7)
    );
    handTrackingContext.restore();
    drawReceiverHandTracking(detectedHands);

    window.dispatchEvent(new CustomEvent('handtracking-results', {
        detail: {
            hands: detectedHands.map(landmarks =>
                fingertipIndices.map(index => ({
                    x: landmarks[index].x,
                    y: landmarks[index].y
                }))
            )
        }
    }));
}

if (typeof Hands !== 'undefined' && typeof Camera !== 'undefined') {
    const hands = new Hands({
        locateFile: file =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
    });

    hands.setOptions({
        maxNumHands: 4,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.6
    });
    hands.onResults(showHandTrackingResults);

    const camera = new Camera(handTrackingVideo, {
        onFrame: async () => {
            await hands.send({ image: handTrackingVideo });
        },
        width: receiverHandTrackingCanvas.width,
        height: receiverHandTrackingCanvas.height
    });

    camera.start().catch(error => {
        console.error('Failed to start hand tracking camera:', error);
    });
} else {
    console.error('MediaPipe Hands or Camera failed to load.');
}
