// Teste específico para limpeza do campo "Atos praticados por"

// Simulação da função extrairDadosSeloMelhorado apenas para a parte de nomes
function testarLimpezaNome(texto) {
  console.log('=== TESTE DE LIMPEZA DE NOME ===');
  console.log('Texto de entrada:', texto);
  
  const atosPorPatterns = [
    /Praticado\(s\)\s+por[:\s]*([^\n\r]+?)(?:\n|\r|$)/i,
    /Atos\s+praticados\s+por[:\s]*([^\n\r]+?)(?:\n|\r|$)/i,
    /praticado\s+por[:\s]*([^\n\r]+?)(?:\n|\r|$)/i,
    /Por[:\s]*([A-Z][^\n\r]+?)(?:\n|\r|$)/i
  ];

  let atosPraticadosPor = '';
  for (const pattern of atosPorPatterns) {
    const match = texto.match(pattern);
    if (match && match[1] && match[1].trim().length > 3) {
      let nome = match[1].trim();
      
      console.log('Nome original capturado:', `"${nome}"`);
      
      // Remove caracteres estranhos e lixo do OCR no final da linha
      nome = nome
        // Remove tudo após hífen seguido de texto minúsculo (provável lixo do OCR)
        .replace(/\s*-\s*[a-z\s]+$/i, '')
        // Remove sequências de caracteres estranhos no final
        .replace(/\s*[^\w\s]+\s*[a-z\s]*$/i, '')
        // Remove palavras isoladas de 1-3 caracteres no final (provável lixo)
        .replace(/\s+[a-z]{1,3}(\s+[a-z]{1,3})*\s*$/i, '')
        // Remove números isolados no final
        .replace(/\s+\d+\s*$/g, '')
        // Remove caracteres especiais, exceto espaços, hífens em nomes e pontos
        .replace(/[^\w\sÀ-ÿ\-\.]/g, ' ')
        // Normaliza espaços múltiplos
        .replace(/\s+/g, ' ')
        .trim();
      
      console.log('Nome após limpeza:', `"${nome}"`);
      
      // Verifica se o nome ainda tem um tamanho razoável
      if (nome.length > 5) {
        atosPraticadosPor = nome;
        console.log('✅ Nome aceito:', `"${atosPraticadosPor}"`);
        break;
      } else {
        console.log('❌ Nome rejeitado (muito curto):', `"${nome}"`);
      }
    }
  }
  
  return atosPraticadosPor;
}

// Testes com diferentes exemplos problemáticos
console.log('\n🧪 TESTE 1: Nome com lixo após hífen');
const exemplo1 = `Ato(s) Praticado(s) por: JANAINA STANNISLAVA E SILVA - air ato
ESCREVENTE AUTORIZADA`;
testarLimpezaNome(exemplo1);

console.log('\n🧪 TESTE 2: Nome com caracteres estranhos');
const exemplo2 = `Ato(s) Praticado(s) por: MARIA JOSÉ DA SILVA RRFRcSaSoS
ESCREVENTE AUTORIZADA`;
testarLimpezaNome(exemplo2);

console.log('\n🧪 TESTE 3: Nome limpo (deve manter)');
const exemplo3 = `Ato(s) Praticado(s) por: JOÃO CARLOS PEREIRA
ESCREVENTE AUTORIZADA`;
testarLimpezaNome(exemplo3);

console.log('\n🧪 TESTE 4: Nome com hífen válido no meio');
const exemplo4 = `Ato(s) Praticado(s) por: ANNE-MARIE COSTA - xyz abc
ESCREVENTE AUTORIZADA`;
testarLimpezaNome(exemplo4);

console.log('\n🧪 TESTE 5: Nome com números no final (lixo)');
const exemplo5 = `Ato(s) Praticado(s) por: PEDRO SANTOS 123
ESCREVENTE AUTORIZADA`;
testarLimpezaNome(exemplo5);
