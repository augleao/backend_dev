// Teste específico para correção de erro OCR
// Problema: "1(7802), 117901)" deveria ser "1(7802), 1(7901)"

// Importar a função de extração melhorada (simulada)
function extrairDadosSeloMelhorado(texto) {
  const textoNormalizado = texto
    .replace(/[àáâãäåæ]/gi, 'a')
    .replace(/[èéêë]/gi, 'e')
    .replace(/[ìíîï]/gi, 'i')
    .replace(/[òóôõöø]/gi, 'o')
    .replace(/[ùúûü]/gi, 'u')
    .replace(/[ç]/gi, 'c')
    .replace(/[ñ]/gi, 'n')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // === EXTRAÇÃO DA QUANTIDADE DE ATOS ===
  const qtdPatterns = [
    /Quantidade\s+de\s+atos\s+praticados[:\s]*(\d+)/i,
    /qtd\s*atos[:\s]*(\d+)/i,
    /quantidade[:\s]*(\d+)/i,
    /(\d+)\s+atos?\s+praticados?/i,
    /praticados?[:\s]*(\d+)/i
  ];

  let qtdAtos = null;
  let qtdAtosCompleto = null;

  // Primeiro tentar no texto original
  for (const pattern of qtdPatterns) {
    const match = texto.match(pattern);
    if (match && match[1]) {
      const numero = parseInt(match[1], 10);
      if (numero > 0 && numero < 1000) {
        qtdAtos = numero;
        console.log(`[OCR] Quantidade capturada: ${qtdAtos} (pattern: ${pattern})`);
        break;
      }
    }
  }

  // Se não encontrou no texto original, tentar no normalizado
  if (qtdAtos === null) {
    for (const pattern of qtdPatterns) {
      const match = textoNormalizado.match(pattern);
      if (match && match[1]) {
        const numero = parseInt(match[1], 10);
        if (numero > 0 && numero < 1000) {
          qtdAtos = numero;
          console.log(`[OCR] Quantidade capturada (normalizado): ${qtdAtos} (pattern: ${pattern})`);
          break;
        }
      }
    }
  }

  // Captura informações adicionais dos atos (códigos entre parênteses)
  if (qtdAtos !== null) {
    console.log(`[OCR] Procurando códigos adicionais para quantidade: ${qtdAtos}`);
    
    // PRIMEIRO: Procurar e corrigir erros comuns do OCR
    console.log(`[OCR] Verificando erros de OCR...`);
    
    // Padrão para detectar erros específicos como "1(7802), 117901)"
    // onde "117901)" deveria ser "1(7901)"
    const textoParaCorrecao = qtdAtosCompleto || texto;
    
    // Padrão específico: capturar a string inteira que pode conter erros
    const padraoCompleto = new RegExp(`${qtdAtos}\\s*\\([^)]+\\)[^\\n]*`, 'i');
    const matchCompleto = textoParaCorrecao.match(padraoCompleto);
    
    let encontrado = false;
    if (matchCompleto) {
      let stringCompleta = matchCompleto[0];
      console.log(`[OCR] String completa encontrada: "${stringCompleta}"`);
      
      // Procurar por padrões de erro como "117901)" que deveriam ser "1(7901)"
      // Padrão: número de 5+ dígitos seguido de )
      const erroPattern = /(\d{5,})\)/g;
      const errosEncontrados = [...stringCompleta.matchAll(erroPattern)];
      
      if (errosEncontrados.length > 0) {
        console.log(`[OCR] Erros de OCR detectados:`, errosEncontrados.map(m => m[0]));
        
        for (const erro of errosEncontrados) {
          const numeroErrado = erro[1]; // Ex: "17901"
          
          // Se tem 5+ dígitos, provavelmente o primeiro dígito é a quantidade
          // e os próximos 4 são o código
          if (numeroErrado.length >= 5) {
            const primeiroDigito = numeroErrado[0];
            const codigo4Digitos = numeroErrado.slice(1, 5);
            
            const padraoCorreto = `${primeiroDigito}(${codigo4Digitos})`;
            console.log(`[OCR] Corrigindo "${erro[0]}" para "${padraoCorreto}"`);
            
            // Substituir na string completa
            stringCompleta = stringCompleta.replace(erro[0], padraoCorreto);
          }
        }
        
        qtdAtosCompleto = stringCompleta;
        console.log(`[OCR] ERRO CORRIGIDO: String final = "${qtdAtosCompleto}"`);
        encontrado = true;
      }
    }
    
    // Se não encontrou na string completa, procurar erros individuais
    if (!encontrado) {
      const erroOcrPatterns = [
        // Padrão: qtdAtos + 4+ dígitos + )
        new RegExp(`\\b${qtdAtos}(\\d{4,})\\)`, 'g'),
        // Padrão: número de 5+ dígitos + )
        /(\d{5,})\)/g
      ];
      
      for (const pattern of erroOcrPatterns) {
        const matches = [...texto.matchAll(pattern)];
        if (matches.length > 0) {
          for (const match of matches) {
            console.log(`[OCR] Possível erro detectado: "${match[0]}"`);
            
            const numeroCompleto = match[1];
            
            if (numeroCompleto && numeroCompleto.length >= 4) {
              // Se começa com qtdAtos, extrair só os 4 dígitos do código
              if (numeroCompleto.startsWith(qtdAtos.toString())) {
                const codigo4Digitos = numeroCompleto.slice(qtdAtos.toString().length, qtdAtos.toString().length + 4);
                qtdAtosCompleto = `${qtdAtos}(${codigo4Digitos})`;
              } else {
                // Se é um número longo, primeiro dígito = qtd, próximos 4 = código
                const primeiroDigito = numeroCompleto[0];
                const codigo4Digitos = numeroCompleto.slice(1, 5);
                qtdAtosCompleto = `${primeiroDigito}(${codigo4Digitos})`;
              }
              
              console.log(`[OCR] ERRO CORRIGIDO: "${match[0]}" -> "${qtdAtosCompleto}"`);
              encontrado = true;
              break;
            }
          }
          if (encontrado) break;
        }
      }
    }
    
    // Se ainda não encontrou, procurar padrões normais já corretos
    if (!encontrado) {
      const codigosAdicionaisPatterns = [
        // Captura sequência como "1(7802), 117901)" 
        new RegExp(`${qtdAtos}\\s*\\([^)]+\\)[^\\n]*`, 'i'),
        // Captura linha que contém códigos em parênteses
        /(\d+\s*\([^)]+\)[^)]*\))/i,
        // Captura qualquer sequência de números com parênteses na linha seguinte
        /(\d+\s*\([^)]+\)[^\\n]*)/i,
        // Padrão mais específico para "(7802), 117901)"
        /(\d+\s*\([^)]+\),?\s*\d*\)?)/i
      ];
      
      for (const pattern of codigosAdicionaisPatterns) {
        const match = texto.match(pattern);
        if (match && match[0]) {
          qtdAtosCompleto = match[0].trim();
          console.log(`[OCR] Códigos adicionais encontrados: ${qtdAtosCompleto}`);
          encontrado = true;
          break;
        }
      }

      // Padrão alternativo: procurar 4 dígitos isolados próximos à quantidade
      if (!encontrado) {
        const digitosProximosPattern = new RegExp(`${qtdAtos}[^\\d\\n]{0,10}(\\d{4})[^\\d]`, 'i');
        const digitosMatch = texto.match(digitosProximosPattern);
        if (digitosMatch) {
          qtdAtosCompleto = `${qtdAtos}(${digitosMatch[1]})`;
          console.log(`[OCR] Padrão alternativo encontrado: "${qtdAtosCompleto}"`);
        }
      }
    }
  }

  // Garantir que usemos qtdAtosCompleto quando disponível
  if (qtdAtosCompleto) {
    console.log(`[OCR] Usando quantidade completa: "${qtdAtosCompleto}"`);
  } else if (qtdAtos !== null) {
    console.log(`[OCR] Usando apenas número base: ${qtdAtos}`);
    qtdAtosCompleto = qtdAtos.toString();
  }

  // Log final para debug
  console.log(`[OCR] Resultado final: qtdAtos=${qtdAtos}, qtdAtosCompleto="${qtdAtosCompleto}"`);

  // Usar qtdAtosCompleto (string) como valor principal para qtdAtos
  const qtdAtosFinal = qtdAtosCompleto || (qtdAtos ? qtdAtos.toString() : null);
  console.log(`[OCR] Valor final para banco: "${qtdAtosFinal}"`);

  return {
    qtdAtos: qtdAtosFinal,
    qtdAtosCompleto: qtdAtosCompleto
  };
}

// === TESTES ===
console.log('=== TESTE DE CORREÇÃO OCR ===\n');

const testeCases = [
  {
    nome: 'Caso problemático: 1(7802), 117901)',
    texto: `Quantidade de atos praticados: 2
1(7802), 117901) Nuk: A A
Ato(s) Praticado(s) por: JANAINA STANNISLAVA`,
    esperado: '1(7802), 1(7901)'
  },
  {
    nome: 'Caso normal: já correto',
    texto: `Quantidade de atos praticados: 2
1(7802), 1(7901)
Ato(s) Praticado(s) por: JANAINA STANNISLAVA`,
    esperado: '1(7802), 1(7901)'
  },
  {
    nome: 'Caso com erro: 217802)',
    texto: `Quantidade de atos praticados: 2
217802)
Ato(s) Praticado(s) por: JANAINA STANNISLAVA`,
    esperado: '2(7802)'
  }
];

testeCases.forEach((teste, index) => {
  console.log(`\n--- TESTE ${index + 1}: ${teste.nome} ---`);
  console.log(`Texto de entrada: "${teste.texto.replace(/\n/g, '\\n')}"`);
  console.log(`Resultado esperado: "${teste.esperado}"`);
  
  const resultado = extrairDadosSeloMelhorado(teste.texto);
  
  console.log(`Resultado obtido: "${resultado.qtdAtos}"`);
  
  const sucesso = resultado.qtdAtos === teste.esperado;
  console.log(`Status: ${sucesso ? '✅ PASSOU' : '❌ FALHOU'}`);
  
  if (!sucesso) {
    console.log(`❌ Esperado: "${teste.esperado}", Obtido: "${resultado.qtdAtos}"`);
  }
});

console.log('\n=== FIM DOS TESTES ===');
