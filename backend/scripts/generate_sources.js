// scripts/generate_sources.js

const fs = require('fs');
const path = require('path');

const modelsPath = path.join('../public/models/toycar2');
const outputPath = path.join(__dirname, '../data/sources_3.js');

if (!fs.existsSync(modelsPath)) {
    console.error('❌ El directorio no existe:', modelsPath);
    process.exit(1);
}

const files = fs.readdirSync(modelsPath);
const sources = [];

files.forEach(file => {
    if (file.endsWith('.glb')) {
        const name = path.basename(file, '.glb').toLowerCase();
        sources.push({
            name,
            type: 'gltfModel',
            path: `/models/toycar/${file}`
        });
    }
});

const output = `export const sources = ${JSON.stringify(sources, null, 4)};\n`;

fs.writeFileSync(outputPath, output, 'utf-8');

console.log('✅ Archivo sources.js generado con éxito en:', outputPath);
