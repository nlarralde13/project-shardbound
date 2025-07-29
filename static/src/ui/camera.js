let zoomLevel = 1.0;
const zoomSteps = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
let currentZoomIndex = 0;
let lastZoomTime = 0;
let zoomKeyActive = false;


/**
 * Initializes zoom key controls and overlays.
 */
export function initCamera(canvas, ctx, shard, renderFn, overlayElId = null) {
    document.addEventListener('keydown', (e) => {
    const now = Date.now();
    
    //if (now - lastZoomTime < 500) return;  // 0.5 second cooldown

    if (e.key === '+' || e.key === '=') {
        if (currentZoomIndex > 0) {
            currentZoomIndex--;
            zoomLevel = zoomSteps[currentZoomIndex];
            lastZoomTime = now;
            applyZoom(ctx, canvas, shard, renderFn, overlayElId);
        }
    } else if (e.key === '-') {
        if (currentZoomIndex < zoomSteps.length - 1) {
            currentZoomIndex++;
            zoomLevel = zoomSteps[currentZoomIndex];
            lastZoomTime = now;
            applyZoom(ctx, canvas, shard, renderFn, overlayElId);
        }
    }

    //Enable Z for mapZoom
    document.addEventListener('keydown', (e) => {
        if (e.key === 'z' || e.key === 'Z') zoomKeyActive = true;
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'z' || e.key === 'Z') zoomKeyActive = false;
    });


    //SCROLL WHEEL ZOOM
    const zoomTarget = canvas.parentElement || canvas;

    zoomTarget.addEventListener('wheel', (e) => {
    const now = Date.now();
    if (now - lastZoomTime < 500) return;
    if (!zoomKeyActive) return;  // ✅ Require Z key to be held

    if (e.deltaY < 0) {
        if (currentZoomIndex > 0) {
            currentZoomIndex--;
            zoomLevel = zoomSteps[currentZoomIndex];
            lastZoomTime = now;
            applyZoom(ctx, canvas, shard, renderFn, overlayElId);
        }
    } else {
        if (currentZoomIndex < zoomSteps.length - 1) {
            currentZoomIndex++;
            zoomLevel = zoomSteps[currentZoomIndex];
            lastZoomTime = now;
            applyZoom(ctx, canvas, shard, renderFn, overlayElId);
        }
    }

    e.preventDefault();
}, { passive: false });


});

}

/**
 * Applies the current zoom level and re-renders the shard.
 */
export function applyZoom(ctx, canvas, shard, renderFn, overlayElId = null) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset zoom
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas

    ctx.setTransform(zoomLevel, 0, 0, zoomLevel, 0, 0); // Apply new zoom
    renderFn(ctx, shard); // Redraw

    // Adjust canvas wrapper size for centering
    const wrapper = document.getElementById('canvasWrapper');
    if (wrapper) {
        wrapper.style.width = canvas.width * zoomLevel + 'px';
        wrapper.style.height = canvas.height * zoomLevel + 'px';
        wrapper.style.margin = '0 auto';
        wrapper.style.display = 'block';
    }

    // Update zoom overlay
    if (overlayElId) {
        const overlay = document.getElementById(overlayElId);
        if (overlay) {
            overlay.textContent = Math.round(zoomLevel * 100) + '%';
        }
    }
}

/**
 * Returns the current zoom level (for external access).
 */
export function getZoomLevel() {
    return zoomLevel;
}

/**
 * Centers the #viewport on the canvas based on current zoom level.
 */
export function centerViewport(viewportEl, canvas) {
    viewportEl.scrollLeft = (canvas.width * zoomLevel - viewportEl.clientWidth) / 2;
    viewportEl.scrollTop = (canvas.height * zoomLevel - viewportEl.clientHeight) / 2;
}
