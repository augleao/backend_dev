// Teste para verificar a extração completa do OCR com foco na quantidade de atos
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

console.log('=== TESTE DE EXTRAÇÃO QUANTIDADE DE ATOS ===');
console.log('Texto do selo:', textoSeloReal);
console.log('');

// Simular a extração de quantidade como no código atual
function testarQuantidadeAtos(texto) {
  console.log('=== TESTANDO QUANTIDADE DE ATOS ===');
  
  // Texto normalizado (como no código real)
  const textoNormalizado = texto
    .replace(/[áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]/g, (match) => {
      const map = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
        'ã': 'a', 'õ': 'o', 'ç': 'c',
        'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
        'Â': 'A', 'Ê': 'E', 'Î': 'I', 'Ô': 'O', 'Û': 'U',
        'Ã': 'A', 'Õ': 'O', 'Ç': 'C'
      };
      return map[match] || match;
    })
    .replace(/[^\w\s:.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  console.log('Texto normalizado:', textoNormalizado);
  console.log('');

  // === QUANTIDADE DE ATOS ===
  const qtdPatterns = [
    // Padrões específicos para o formato do TJ
    /Quantidade\s+de\s+atos\s+praticados[:\s]*(\d+)/i,
    /Qtd\.?\s+Atos[:\s]*(\d+)/i,
    /Qtd\s+de\s+atos[:\s]*(\d+)/i,
    /quantidade[:\s]*(\d+)/i,
    /(\d+)\s+atos/i,
    // Captura números seguidos de código em parênteses como "1(7804)"
    /(\d+)\s*\(\d+\)/i,
    // Captura número isolado em linhas que podem representar quantidade
    /^(\d+)\s*$/m,
    // Padrão para formato "1 Elise" (onde Elise pode ser parte do OCR)
    /(\d+)\s+[A-Za-z]+/i
  ];

  let qtdAtos = null;
  // Primeiro tenta padrões específicos no texto original
  console.log('--- Testando no texto ORIGINAL ---');
  for (let i = 0; i < qtdPatterns.length; i++) {
    const pattern = qtdPatterns[i];
    const match = texto.match(pattern);
    console.log(`Padrão ${i + 1}: ${pattern}`);
    if (match && match[1]) {
      const numero = parseInt(match[1], 10);
      console.log(`  Match encontrado: "${match[0]}" -> Número: ${numero}`);
      // Valida se é um número razoável para quantidade de atos (1-999)
      if (numero > 0 && numero < 1000) {
        console.log(`  ✅ Número válido: ${numero}`);
        if (qtdAtos === null) {
          qtdAtos = numero;
          console.log(`  🎯 QUANTIDADE DEFINIDA: ${qtdAtos}`);
        }
      } else {
        console.log(`  ❌ Número fora do range válido: ${numero}`);
      }
    } else {
      console.log('  ⭕ Sem match');
    }
  }
  
  // Se não encontrou no texto original, tenta no normalizado
  if (qtdAtos === null) {
    console.log('');
    console.log('--- Testando no texto NORMALIZADO ---');
    for (let i = 0; i < qtdPatterns.length; i++) {
      const pattern = qtdPatterns[i];
      const match = textoNormalizado.match(pattern);
      console.log(`Padrão ${i + 1}: ${pattern}`);
      if (match && match[1]) {
        const numero = parseInt(match[1], 10);
        console.log(`  Match encontrado: "${match[0]}" -> Número: ${numero}`);
        if (numero > 0 && numero < 1000) {
          console.log(`  ✅ Número válido: ${numero}`);
          if (qtdAtos === null) {
            qtdAtos = numero;
            console.log(`  🎯 QUANTIDADE DEFINIDA: ${qtdAtos}`);
          }
        } else {
          console.log(`  ❌ Número fora do range válido: ${numero}`);
        }
      } else {
        console.log('  ⭕ Sem match');
      }
    }
  }

  console.log('');
  console.log('=== RESULTADO FINAL ===');
  console.log('Quantidade de atos capturada:', qtdAtos);
  
  return qtdAtos;
}

const resultado = testarQuantidadeAtos(textoSeloReal);
