const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Pré-processa uma imagem para OCR: escala de cinza, binarização, aumento de contraste e remoção de ruído.
 * @param {string} inputPath Caminho da imagem original
 * @returns {Promise<string>} Caminho da imagem pré-processada (arquivo temporário)
 */
async function preprocessImage(inputPath) {
  const outputPath = path.join(
    path.dirname(inputPath),
    'preprocessed_' + path.basename(inputPath)
  );

  await sharp(inputPath)
    .grayscale()
    .threshold(160) // binarização
    .normalize() // aumenta contraste
    .median(1) // filtro de remoção de ruído
    .toFile(outputPath);

  return outputPath;
}

module.exports = { preprocessImage };
