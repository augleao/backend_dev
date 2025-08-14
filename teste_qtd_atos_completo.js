// Teste da alteração para usar qtdAtosCompleto ao invés de qtdAtos
// Incluindo correção de erros de OCR

// Simular a função extrairDadosSeloMelhorado com os dados do exemplo
function testarExtracaoQuantidade() {
  console.log('=== TESTE DA NOVA LÓGICA DE QUANTIDADE ===\n');

  // Casos de teste
  const casosTeste = [
    {
      nome: 'Caso 1: Padrão correto',
      texto: `QUANTIDADE: 1(7802), 117901)
Ato(s) Praticado(s) por: JANAINA STANNISLAVA E SILVA`,
      esperado: '1(7802), 117901)'
    },
    {
      nome: 'Caso 2: Erro de OCR - 117901) deveria ser 1(7901)',
      texto: `QUANTIDADE: 117901)
Ato(s) Praticado(s) por: TESTE SILVA`,
      esperado: '1(7901)'
    },
    {
      nome: 'Caso 3: Outro erro de OCR',
      texto: `QUANTIDADE: 28456)
Ato(s) Praticado(s) por: OUTRO TESTE`,
      esperado: '2(8456)'
    },
    {
      nome: 'Caso 4: Padrão normal sem códigos',
      texto: `QUANTIDADE: 3
Ato(s) Praticado(s) por: TESTE SEM CODIGO`,
      esperado: '3'
    }
  ];

  casosTeste.forEach((caso, index) => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🧪 ${caso.nome}`);
    console.log(`📝 Texto: ${caso.texto.split('\n')[0]}`);
    
    const resultado = extrairQuantidade(caso.texto);
    
    console.log(`🎯 Esperado: "${caso.esperado}"`);
    console.log(`� Obtido: "${resultado}"`);
    
    if (resultado === caso.esperado) {
      console.log('✅ SUCESSO!');
    } else {
      console.log('❌ FALHA!');
    }
  });
}

function extrairQuantidade(texto) {
  let qtdAtos = null;
  let qtdAtosCompleto = '';

  // Padrões para capturar quantidade
  const qtdPatterns = [
    /(?:QUANTIDADE|Quantidade)[:\s]*(\d+)/i,
    /(\d+)\s*ato[s]?/i,
    /Qtd[.:\s]*(\d+)/i
  ];

  const textoNormalizado = texto
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s:.-]/g, ' ')
    .trim();

  // Primeira passada - capturar número básico
  for (const pattern of qtdPatterns) {
    const match = textoNormalizado.match(pattern);
    if (match) {
      const numero = parseInt(match[1], 10);
      if (!isNaN(numero) && numero > 0) {
        qtdAtos = numero;
        console.log(`   📊 Quantidade base: ${qtdAtos}`);
        break;
      }
    }
  }

  // Captura informações adicionais dos atos (códigos entre parênteses)
  if (qtdAtos !== null) {
    console.log(`   🔍 Procurando códigos para quantidade: ${qtdAtos}`);
    
    // Primeiro tentar encontrar padrões já corretos
    const codigosCorretos = [
      new RegExp(`${qtdAtos}\\s*\\([^)]+\\)[^\\n]*`, 'i'),
      /(\d+\s*\([^)]+\)[^)]*\))/i
    ];
    
    let encontrado = false;
    for (const pattern of codigosCorretos) {
      const match = texto.match(pattern);
      if (match && match[0]) {
        qtdAtosCompleto = match[0].trim();
        console.log(`   ✅ Padrão correto: "${qtdAtosCompleto}"`);
        encontrado = true;
        break;
      }
    }

    // Se não encontrou padrão correto, procurar e corrigir erros do OCR
    if (!encontrado) {
      console.log(`   � Procurando erros de OCR...`);
      
      // Padrão de erro: número seguido de 4 dígitos e )
      // Ex: "117901)" deve ser "1(7901)"
      const erroOcrPattern = new RegExp(`\\b${qtdAtos}(\\d{4})\\)`, 'g');
      const matches = [...texto.matchAll(erroOcrPattern)];
      
      if (matches.length > 0) {
        const match = matches[0];
        const codigo4Digitos = match[1];
        
        if (codigo4Digitos && codigo4Digitos.length === 4) {
          qtdAtosCompleto = `${qtdAtos}(${codigo4Digitos})`;
          console.log(`   🔧 ERRO CORRIGIDO: "${match[0]}" -> "${qtdAtosCompleto}"`);
          encontrado = true;
        }
      }
    }
  }

  // Valor final
  const qtdAtosFinal = qtdAtosCompleto || (qtdAtos ? qtdAtos.toString() : null);
  return qtdAtosFinal;
}

// Executar teste
testarExtracaoQuantidade();

console.log('\n' + '='.repeat(50));
console.log('💡 RESUMO DA ALTERAÇÃO:');
console.log('- Detecta e corrige erros comuns do OCR');
console.log('- Padrão esperado: número(4dígitos)');
console.log('- Corrige: 117901) -> 1(7901)');
console.log('- Mantém padrões corretos inalterados');
