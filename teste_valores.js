// Teste para verificar a extração de valores do OCR com o texto real do log
const textoSeloReal = `PODER JUDICIÁRIO - TJIMG / CORREGEDORIA GERAL DE JUSTIÇA
1º OFÍCIO REGISTRO CIVIL DAS PESSOAS NATURAIS DE
CAMPANHA - MG
SELO DE CONSULTA: HQJOS131
CÓDIGO DE SEGURANÇA: 0471.1314.0274.7824
Quantidade de atos praticados: 1 Elise
1(7804) AAA:

Ato(s) Praticado(s) por: JANAINA STANNISLAVA E silva RRFRcSaSoS
ESCREVENTE AUTORIZADA - Emol: R$ 50,73 - Tx. Judic:: R$ 10,25-  pESPeFTRA
Total: R$60,98 - ISS: R$ 1,42 Elpge

Consulte a validade deste selo no site: https:/selos.tima jus.br`;

console.log('=== TESTE DE EXTRAÇÃO COMPLETA ===');
console.log('Texto do selo:', textoSeloReal);
console.log('');

// Simular a extração completa como no código atual
function extrairDadosCompletos(texto) {
  // === VALORES ===
  // Extrai todos os valores monetários encontrados no texto ORIGINAL (não normalizado)
  const valoresEncontrados = [];
  
  // Padrões para encontrar valores específicos com suas etiquetas no texto original
  const valoresEspecificos = [
    { nome: 'Emol', pattern: /Emol\.?[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'Tx. Judic', pattern: /Tx\.?\s*Judic\.?[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'Total', pattern: /Total[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'ISS', pattern: /ISS[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'ISSQN', pattern: /ISSQN[:\s]*R\$?\s*([\d,\.]+)/gi },
    { nome: 'Taxa', pattern: /Taxa[:\s]*R\$?\s*([\d,\.]+)/gi }
  ];
  
  // Busca valores específicos com etiquetas no texto ORIGINAL
  for (const valorEspecifico of valoresEspecificos) {
    let match;
    while ((match = valorEspecifico.pattern.exec(texto)) !== null) {
      valoresEncontrados.push({
        tipo: valorEspecifico.nome,
        valor: match[1],
        posicao: match.index
      });
    }
  }
  
  // Se não encontrou valores específicos, busca padrão geral no texto original
  if (valoresEncontrados.length === 0) {
    const padraoGeralValores = /R\$\s*([\d]{1,3}(?:[,\.]\d{2})?)/gi;
    let matchGeral;
    while ((matchGeral = padraoGeralValores.exec(texto)) !== null) {
      valoresEncontrados.push({
        tipo: 'Valor',
        valor: matchGeral[1],
        posicao: matchGeral.index
      });
    }
  }
  
  // Ordena valores por posição no texto
  valoresEncontrados.sort((a, b) => a.posicao - b.posicao);
  
  // Cria string com todos os valores encontrados
  const valores = valoresEncontrados.length > 0 
    ? valoresEncontrados.map(v => `${v.tipo}: R$ ${v.valor}`).join(' - ')
    : '';
  
  // === CÓDIGO DE SEGURANÇA ===
  const codigoPatterns = [
    /CÓDIGO\s+DE\s+SEGURANÇA[:\s]*([\d\.\,\-]+)/i,
    /(\d{4}\.\d{4}\.\d{4}\.\d{4})/i
  ];

  let codigoSeguranca = '';
  for (const pattern of codigoPatterns) {
    const match = texto.match(pattern);
    if (match && match[1]) {
      codigoSeguranca = match[1];
      break;
    }
  }
  
  console.log('[OCR] Valores encontrados:', valoresEncontrados);
  
  return { 
    valores, 
    valoresDetalhados: valoresEncontrados,
    codigoSeguranca 
  };
}

const resultado = extrairDadosCompletos(textoSeloReal);

console.log('');
console.log('=== RESULTADO ===');
console.log('Valores extraídos:', resultado.valores);
console.log('Código de segurança:', resultado.codigoSeguranca);
console.log('Detalhes dos valores:', JSON.stringify(resultado.valoresDetalhados, null, 2));
