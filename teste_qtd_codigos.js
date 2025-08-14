// Teste específico para capturar quantidade de atos com códigos adicionais
const textoTeste = `PODER JUDICIÁRIO - TMG / CORREGEDORIA GERAL DE JUSTIÇA
1º OFÍCIO REGISTRO CIVIL DAS PESSOAS NATURAIS DE
CAMPANHA - MG
SELO DE CONSULTA: HQJOS149
CÓDIGO DE SEGURANÇA: 5645.3484.5566.1219

Quantidade de atos praticados: 2. EXE
1(7802), 117901) Nuk: A A
Ato(s) Praticado(s) por: JANAINA STANNISLAVA E SILVA - air ato
ESCREVENTE AUTORIZADA - Emol.: R$ 60,61 - Tx.Judic.: R$ 11,51-  REgEAS HÉEMA
Total: R$ 72,12-1SS: R$ 1,70 ESTE

Consulte a validade deste selo no site: https://selos.timg jus.br`;

function extrairQuantidadeComCodigos(texto) {
  console.log('=== EXTRAÇÃO DE QUANTIDADE COM CÓDIGOS ===');
  console.log('Texto original:');
  console.log(texto);
  console.log('');

  // Normalizar o texto
  const textoNormalizado = texto
    .replace(/\s+/g, ' ')  // Múltiplos espaços para um só
    .replace(/[^\w\s:.-]/g, ' ')  // Remove caracteres especiais exceto : . -
    .trim();

  console.log('Texto normalizado:', textoNormalizado);
  console.log('');

  // === QUANTIDADE DE ATOS ===
  const qtdPatterns = [
    /Quantidade\s+de\s+atos\s+praticados[:\s]*(\d+)/i,
    /Qtd\.?\s+Atos[:\s]*(\d+)/i,
    /Qtd\s+de\s+atos[:\s]*(\d+)/i,
    /quantidade[:\s]*(\d+)/i,
    /(\d+)\s+atos/i,
    /(\d+)\s*\(\d+\)/i,
    /^(\d+)\s*$/m,
    /(\d+)\s+[A-Za-z]+/i
  ];

  let qtdAtos = null;
  let qtdAtosCompleto = '';
  
  // Primeiro tenta padrões específicos no texto original
  console.log('--- Buscando quantidade base ---');
  for (const pattern of qtdPatterns) {
    const match = texto.match(pattern);
    if (match && match[1]) {
      const numero = parseInt(match[1], 10);
      console.log(`Padrão: ${pattern} -> Match: "${match[0]}" -> Número: ${numero}`);
      if (numero > 0 && numero < 1000) {
        qtdAtos = numero;
        console.log(`✅ Quantidade base encontrada: ${numero}`);
        break;
      }
    }
  }
  
  // Se não encontrou no texto original, tenta no normalizado
  if (qtdAtos === null) {
    console.log('--- Tentando no texto normalizado ---');
    for (const pattern of qtdPatterns) {
      const match = textoNormalizado.match(pattern);
      if (match && match[1]) {
        const numero = parseInt(match[1], 10);
        console.log(`Padrão: ${pattern} -> Match: "${match[0]}" -> Número: ${numero}`);
        if (numero > 0 && numero < 1000) {
          qtdAtos = numero;
          console.log(`✅ Quantidade base encontrada (normalizado): ${numero}`);
          break;
        }
      }
    }
  }

  // Captura informações adicionais dos atos (códigos entre parênteses)
  if (qtdAtos !== null) {
    console.log('');
    console.log('--- Buscando códigos adicionais ---');
    
    // Busca por códigos adicionais após a quantidade
    const codigosAdicionaisPatterns = [
      // Captura sequência como "2(7802), 117901)" 
      new RegExp(`${qtdAtos}\\s*\\([^)]+\\)[^\\n]*`, 'i'),
      // Captura linha que contém códigos em parênteses
      /(\d+\s*\([^)]+\)[^)]*\))/i,
      // Captura qualquer sequência de números com parênteses na linha seguinte
      /(\d+\s*\([^)]+\)[^\\n]*)/i,
      // Padrão mais específico para "1(7802), 117901)"
      /(\d+\s*\([^)]+\),?\s*\d*\)?)/i
    ];
    
    for (let i = 0; i < codigosAdicionaisPatterns.length; i++) {
      const pattern = codigosAdicionaisPatterns[i];
      const match = texto.match(pattern);
      console.log(`Padrão ${i + 1}: ${pattern}`);
      if (match && match[0]) {
        qtdAtosCompleto = match[0].trim();
        console.log(`✅ Códigos encontrados: "${qtdAtosCompleto}"`);
        break;
      } else {
        console.log('⭕ Sem match');
      }
    }
    
    // Se encontrou códigos adicionais, inclui na resposta
    if (qtdAtosCompleto) {
      console.log(`🎯 Quantidade final será: "${qtdAtosCompleto}"`);
      qtdAtos = qtdAtosCompleto;
    } else {
      console.log(`🎯 Quantidade final será apenas: ${qtdAtos}`);
    }
  }

  console.log('');
  console.log('=== RESULTADO FINAL ===');
  console.log('qtdAtos:', qtdAtos);
  console.log('qtdAtosCompleto:', qtdAtosCompleto);

  return {
    qtdAtos,
    qtdAtosCompleto
  };
}

const resultado = extrairQuantidadeComCodigos(textoTeste);

console.log('');
console.log('=== VERIFICAÇÃO ===');
console.log('Esperado: quantidade "2" + códigos "(7802), 117901)"');
console.log('Obtido quantidade:', resultado.qtdAtos);
console.log('Obtido completo:', resultado.qtdAtosCompleto);

// Teste específico para o padrão exato do log
console.log('');
console.log('=== TESTE DIRETO DO PADRÃO ===');
const linhaComCodigos = '1(7802), 117901) Nuk: A A';
const padraoEspecifico = /(\d+\s*\([^)]+\),?\s*\d*\)?)/i;
const matchDireto = linhaComCodigos.match(padraoEspecifico);
console.log('Linha teste:', linhaComCodigos);
console.log('Padrão:', padraoEspecifico);
console.log('Match:', matchDireto ? matchDireto[0] : 'Nenhum');
