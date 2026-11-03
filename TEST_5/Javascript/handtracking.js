const handTrackingVideo = document.querySelector('.handtracking-video');
const handTrackingCanvas = document.querySelector('.handtracking-canvas');
const handTrackingContext = handTrackingCanvas.getContext('2d');
const fingertipIndices = [4, 8, 12, 16, 20];

if (!handTrackingContext) {
    throw new Error('Unable to create a canvas for hand tracking.');
}

function drawFingertips(landmarks) {
    handTrackingContext.fillStyle = '#1A1A1A';
    handTrackingContext.strokeStyle = '#F46404';
    handTrackingContext.lineWidth = 1.5;

    for (const index of fingertipIndices) {
        const point = landmarks[index];
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

function showHandTrackingResults(results) {
    const { width, height } = handTrackingCanvas;
    handTrackingContext.save();
    handTrackingContext.clearRect(0, 0, width, height);
    handTrackingContext.translate(width, 0);
    handTrackingContext.scale(-1, 1);

    const detectedHands = results.multiHandLandmarks ?? [];
    detectedHands.forEach(drawFingertips);
    handTrackingContext.restore();

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
        width: handTrackingCanvas.width,
        height: handTrackingCanvas.height
    });

    camera.start().catch(error => {
        console.error('Failed to start hand tracking camera:', error);
    });
} else {
    console.error('MediaPipe Hands or Camera failed to load.');
}
