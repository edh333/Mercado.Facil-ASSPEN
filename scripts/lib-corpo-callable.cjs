/**
 * Localiza o corpo da funcao de um `exports.X = onCall(...)`.
 *
 * CUIDADO: `onCall({ minInstances: 1 }, async (request) => { ... })` tem DOIS
 * objetos. Pegar o primeiro `{` devolve o objeto de OPCOES, nao o corpo — e
 * uma busca por `verificarSenhaMestra` no corpo errado produz FALSO NEGATIVO
 * (gate que "libera" um call site quebrado). Por isso procuramos explicitamente
 * a assinatura `(request) =>` e so entao o `{` que vem depois.
 */
function corpoDoCallable(texto, indiceExport) {
  const onCallIdx = texto.indexOf('onCall(', indiceExport);
  if (onCallIdx < 0) return null;

  // procura `=>` e o `{` que abre o corpo, ignorando o objeto de opcoes
  const setaIdx = texto.indexOf('=>', onCallIdx);
  if (setaIdx < 0) return null;

  const abreIdx = texto.indexOf('{', setaIdx);
  if (abreIdx < 0) return null;

  // casamento de chaves, ignorando strings e comentarios
  let depth = 0;
  for (let i = abreIdx; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < texto.length) {
        if (texto[i] === '\\') { i++; continue; }
        if (texto[i] === q) break;
        if (texto[i] === '\n' && q !== '`') break;
        i++;
      }
      continue;
    }
    if (c === '/' && texto[i + 1] === '/') { while (i < texto.length && texto[i] !== '\n') i++; continue; }
    if (c === '/' && texto[i + 1] === '*') { i += 2; while (i < texto.length && !(texto[i] === '*' && texto[i + 1] === '/')) i++; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return texto.slice(abreIdx, i + 1); }
  }
  return null;
}

module.exports = { corpoDoCallable };
