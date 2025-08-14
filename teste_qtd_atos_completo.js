// Teste da alteração para usar qtdAtosCompleto ao invés de qtdAtos

// Simular a função extrairDadosSeloMelhorado com os dados do exemplo
function testarExtracaoQuantidade() {
  console.log('=== TESTE DA NOVA LÓGICA DE QUANTIDADE ===\n');

  // Exemplo do log anterior
  const textoExemplo = `QUANTIDADE: 1(7802), 117901)
Ato(s) Praticado(s) por: JANAINA STANNISLAVA E SILVA
Emol.: R$ 123,45
Total: R$ 456,78`;

  console.log('📝 Texto de exemplo:');
  console.log(textoExemplo);
  console.log('\n🔍 Simulando extração...\n');

  // Simular a lógica de extração
  let qtdAtos = null;
  let qtdAtosCompleto = '';

  // Padrões para capturar quantidade
  const qtdPatterns = [
    /(?:QUANTIDADE|Quantidade)[:\s]*(\d+)/i,
    /(\d+)\s*ato[s]?/i,
    /Qtd[.:\s]*(\d+)/i
  ];

  const textoNormalizado = textoExemplo
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s:.-]/g, ' ')
    .trim();

  console.log('Texto normalizado:', textoNormalizado);

  // Primeira passada - capturar número básico
  for (const pattern of qtdPatterns) {
    const match = textoNormalizado.match(pattern);
    if (match) {
      const numero = parseInt(match[1], 10);
      if (!isNaN(numero) && numero > 0) {
        qtdAtos = numero;
        console.log(`✅ Quantidade base capturada: ${qtdAtos}`);
        break;
      }
    }
  }

  // Segunda passada - procurar códigos adicionais no texto original
  if (qtdAtos !== null) {
    console.log(`🔍 Procurando códigos adicionais para quantidade: ${qtdAtos}`);
    
    const codigoPatterns = [
      new RegExp(`${qtdAtos}\\s*\\([^)]+\\)[^\\n]*`, 'i'),
      new RegExp(`${qtdAtos}[^\\n]*\\([^)]+\\)`, 'i'),
      new RegExp(`QUANTIDADE[:\\s]*${qtdAtos}[^\\n]*`, 'i')
    ];

    for (const pattern of codigoPatterns) {
      const match = textoExemplo.match(pattern);
      if (match) {
        qtdAtosCompleto = match[0].trim();
        console.log(`✅ Códigos adicionais encontrados: "${qtdAtosCompleto}"`);
        break;
      }
    }
  }

  // Aplicar nova lógica
  console.log(`\n📊 Resultado da extração:`);
  console.log(`   qtdAtos (número base): ${qtdAtos}`);
  console.log(`   qtdAtosCompleto (string): "${qtdAtosCompleto}"`);

  // Valor final para o banco
  const qtdAtosFinal = qtdAtosCompleto || (qtdAtos ? qtdAtos.toString() : null);
  console.log(`\n🎯 Valor final para banco: "${qtdAtosFinal}"`);

  // Verificar se atende aos requisitos
  if (qtdAtosFinal === '1(7802), 117901)') {
    console.log('✅ SUCESSO: Capturou exatamente o valor esperado!');
  } else {
    console.log('❌ FALHA: Valor diferente do esperado');
    console.log(`   Esperado: "1(7802), 117901)"`);
    console.log(`   Obtido: "${qtdAtosFinal}"`);
  }

  return qtdAtosFinal;
}

// Executar teste
testarExtracaoQuantidade();

console.log('\n' + '='.repeat(50));
console.log('💡 RESUMO DA ALTERAÇÃO:');
console.log('- Campo qtd_atos será alterado de int4 para varchar(256)');
console.log('- Código agora usa qtdAtosCompleto como valor principal');
console.log('- Mantém compatibilidade com valores numéricos simples');
console.log('- Captura códigos adicionais como "(7802), 117901)"');
