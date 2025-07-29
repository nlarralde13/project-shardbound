//rendershard.js
export async function renderShard(ctx, shardData) {
    console.log("[renderShard] Starting render with:", shardData.width, "×", shardData.height);
    const tileWidth = 64;
    const tileHeight = 32;

    const biomeColors = {
        grass: "#4CAF50",
        forest: "#2E7D32",
        water: "#2196F3",
        mountain: "#9E9E9E"
    };

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    //ctx.fillStyle = "red";
    //ctx.fillRect(0, 0, 100, 100);

    const originX = ctx.canvas.width / 2;
    const originY = 40;

    for (let y = 0; y < shardData.height; y++) {
        for (let x = 0; x < shardData.width; x++) {
            const tile = shardData.tiles[y][x];
            const biome = tile.biome;
            const screenX = originX + (x - y) * (tileWidth / 2);
            const screenY = originY + (x + y) * (tileHeight / 2);

            // Shadow
            ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
            ctx.beginPath();
            ctx.moveTo(screenX, screenY + tileHeight / 2);
            ctx.lineTo(screenX + tileWidth / 2, screenY + tileHeight);
            ctx.lineTo(screenX, screenY + tileHeight * 1.5);
            ctx.lineTo(screenX - tileWidth / 2, screenY + tileHeight);
            ctx.closePath();
            ctx.fill();

            // Tile
            ctx.fillStyle = biomeColors[biome] || "#555";
            ctx.beginPath();
            ctx.moveTo(screenX, screenY);
            ctx.lineTo(screenX + tileWidth / 2, screenY + tileHeight / 2);
            ctx.lineTo(screenX, screenY + tileHeight);
            ctx.lineTo(screenX - tileWidth / 2, screenY + tileHeight / 2);
            ctx.closePath();
            ctx.fill();
        }
    }
}
