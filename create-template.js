const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function createCleanTemplate() {
    try {
        // Load original template
        const image = await loadImage('./public/template-news.png');
        
        // Create canvas with same dimensions
        const canvas = createCanvas(1080, 1527);
        const ctx = canvas.getContext('2d');
        
        // Draw original image
        ctx.drawImage(image, 0, 0);
        
        // Cover bottom area (remove logo/URL) - make it bigger
        const bottomHeight = canvas.height * 0.15; // 15% from bottom (bigger area)
        ctx.fillStyle = '#f8f6f0'; // Cream color to match template background
        ctx.fillRect(0, canvas.height - bottomHeight, canvas.width, bottomHeight);
        
        console.log('Covering bottom area:', {
            height: bottomHeight,
            startY: canvas.height - bottomHeight,
            canvasHeight: canvas.height
        });
        
        // Save the clean template
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync('./public/template-news-clean.png', buffer);
        
        // Replace original
        fs.writeFileSync('./public/template-news.png', buffer);
        
        console.log('✅ Clean template created successfully!');
        
    } catch (error) {
        console.error('❌ Error creating clean template:', error);
    }
}

createCleanTemplate();