// Teste para verificar a extração de valores do OCR
const textoSelo = `SALDANHA / SÃO LUÍS     SELO DE CONSULTA: 0471.1314.0274.7824     QUANTIDADE: 01     ATOS PRATICADOS POR: JANAINA STANNISLAVA E silva RRFRcSaSoS     EMOL.: R$ 50,73     ISS: R$ 1,42     CÓDIGO DE SEGURANÇA: 0471.1314.0274.7824     https://consulta.seje.ma.gov.br/selo/`;

console.log('=== TESTE DE EXTRAÇÃO DE VALORES ===');
console.log('Texto do selo:', textoSelo);
console.log('');

// Simular a extração de valores como no código atual
function extrairValores(texto) {
  const textoNormalizado = texto;
  
  // === VALORES ===
  // Extrai todos os valores monetários encontrados no texto
  const valoresEncontrados = [];
  
  // Padrões para encontrar valores específicos com suas etiquetas
  const valoresEspecificos = [
    { nome: 'EMOL', pattern: /EMOL\.?[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'ISS', pattern: /ISS[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'ISSQN', pattern: /ISSQN[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'Taxa', pattern: /Taxa[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'Total', pattern: /Total[:\s]*R\$?\s*([\d,\.]+)/gi }
  ];
  
  // Busca valores específicos com etiquetas
  for (const valorEspecifico of valoresEspecificos) {
    let match;
    while ((match = valorEspecifico.pattern.exec(textoNormalizado)) !== null) {
      valoresEncontrados.push({
        tipo: valorEspecifico.nome,
        valor: match[1],
        posicao: match.index
      });
    }
  }
  
  // Padrão geral para capturar todos os valores monetários R$ X,XX
  const padraoGeralValores = /R\$\s*([\d]{1,3}(?:[,\.]\d{2})?)/gi;
  let matchGeral;
  while ((matchGeral = padraoGeralValores.exec(textoNormalizado)) !== null) {
    // Verifica se este valor já não foi capturado com uma etiqueta específica
    const jaCapturado = valoresEncontrados.some(v => 
      Math.abs(v.posicao - matchGeral.index) < 50 && v.valor === matchGeral[1]
    );
    
    if (!jaCapturado) {
      valoresEncontrados.push({
        tipo: 'Geral',
        valor: matchGeral[1],
        posicao: matchGeral.index
      });
    }
  }
  
  // Ordena valores por posição no texto
  valoresEncontrados.sort((a, b) => a.posicao - b.posicao);
  
  // Cria string com todos os valores encontrados
  const valores = valoresEncontrados.length > 0 
    ? valoresEncontrados.map(v => `${v.tipo}: R$ ${v.valor}`).join(' | ')
    : '';
  
  console.log('[OCR] Valores encontrados:', valoresEncontrados);
  
  return { valores, valoresDetalhados: valoresEncontrados };
}

const resultado = extrairValores(textoSelo);

console.log('');
console.log('=== RESULTADO ===');
console.log('Valores extraídos:', resultado.valores);
console.log('Detalhes dos valores:', JSON.stringify(resultado.valoresDetalhados, null, 2));
