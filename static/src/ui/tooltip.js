export function createTooltip() {
    const tooltip = document.createElement('div');
    tooltip.id = 'tileTooltip';
    tooltip.className = 'tooltip-box';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    return tooltip;
}

export function updateTooltip(tooltip, tileData, screenX, screenY, devMode = false) {
    tooltip.style.left = screenX + 12 + 'px';
    tooltip.style.top = screenY + 12 + 'px';

    let html = `<div><strong>(${tileData.x}, ${tileData.y})</strong></div>`;
    html += `<div><span class="label">Biome:</span> <span class="value">${tileData.biome}</span></div>`;

    if (devMode) {
        html += `<div class="divider"></div>`;
        if (tileData.resources?.length) {
            html += `<div><span class="label">Resources:</span> <span class="value">${tileData.resources.join(', ')}</span></div>`;
        }
        if (tileData.encounter) {
            html += `<div><span class="label">Encounter:</span> <span class="value">${tileData.encounter}</span></div>`;
        }
        if (tileData.tags?.length) {
            html += `<div><span class="label">Tags:</span> <span class="value">${tileData.tags.join(', ')}</span></div>`;
        }
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
}

export function hideTooltip(tooltip) {
    tooltip.style.display = 'none';
}
