// utils/pdfUtils.js
const fs = require('fs');
const pdfParse = require('pdf-parse');

async function extractTextWithPdfParse(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

// Aqui você pode adicionar as funções extrairAtos, extrairAtosTabela07, etc.

module.exports = { extractTextWithPdfParse };