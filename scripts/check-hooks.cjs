/**
 * Analise ESTATICA de Rules of Hooks usando a AST do TypeScript (ja instalado).
 *
 * O `npm run lint` do projeto e apenas `tsc --noEmit`, que NAO valida
 * Rules of Hooks. Um hook chamado fora da renderizacao compila perfeitamente
 * e so explode em producao com "Minified React error #321".
 *
 * Heuristicas (equivalentes ao react-hooks/rules-of-hooks):
 *  - hook no escopo de modulo               -> ERRO
 *  - hook dentro de callback aninhado      -> ERRO (useEffect(() => ...))
 *  - hook dentro de funcao nao-componente   -> ERRO
 *  - hook dentro de componente/hook custom -> ok
 *  - hook dentro de condicao/loop/catch    -> ERRO (ordem pode mudar)
 *
 * Uso: node scripts/check-hooks.cjs
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIRS = ['.', 'components', 'pages', 'context', 'hooks', 'services', 'utils'];
const EXT = new Set(['.tsx', '.ts']);
const SKIP = new Set(['node_modules', 'build', 'dist', 'functions', 'desktop', 'scripts', 'coverage', '.git']);

const BUILTIN_HOOKS = new Set([
  'useState', 'useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useMemo', 'useCallback',
  'useRef', 'useContext', 'useReducer', 'useImperativeHandle', 'useDebugValue',
  'useId', 'useTransition', 'useDeferredValue', 'useSyncExternalStore', 'useOptimistic',
  'useActionState', 'useFormStatus', 'useFormState',
]);

const problems = [];
const notes = [];

function walkFiles(dir, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      walkFiles(full, acc);
    } else if (EXT.has(path.extname(e.name))) {
      acc.push(full);
    }
  }
  return acc;
}

function fnName(node, sf) {
  if (!node) return null;
  if (node.name) {
    if (ts.isIdentifier(node.name)) return node.name.text;
    if (ts.isStringLiteral(node.name)) return node.name.text;
  }
  // const Foo = () => {} / function () {}
  if (node.parent && ts.isVariableDeclaration(node.parent) && node.parent.name) {
    return node.parent.name.getText(sf);
  }
  return null;
}

/** Um no e um "componente" se o nome comecar com maiuscula. */
function isComponentLike(name) {
  if (!name) return false;
  const first = name[0];
  return first === first.toUpperCase() && first !== first.toLowerCase() && /[A-Z]/.test(first);
}
/** Custom hook: use* */
function isCustomHook(name) {
  return !!name && /^use[A-Z0-9]/.test(name);
}

function hasNodeModifier(node, kind) {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) || [] : [];
  return mods.some((m) => m.kind === kind);
}

function describeNode(n) {
  switch (n.kind) {
    case ts.SyntaxKind.IfStatement: return 'if/else';
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement: return 'loop';
    case ts.SyntaxKind.SwitchStatement: return 'switch';
    case ts.SyntaxKind.TryStatement: return 'try/catch/finally';
    case ts.SyntaxKind.ConditionalExpression: return 'expressao ternaria';
    case ts.SyntaxKind.BinaryExpression: return 'expressao logica (&& / ||)';
    default: return ts.SyntaxKind[n.kind];
  }
}

function checkFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const rel = path.relative(ROOT, file);

  function report(node, msg) {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    problems.push(`${rel}:${line + 1}:${character + 1}  ${msg}`);
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      let hookName = null;
      if (ts.isIdentifier(callee)) hookName = callee.text;
      else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
        && (callee.expression.text === 'React' || callee.expression.text === 'ReactDOM')) {
        hookName = callee.name.text;
      }

      if (hookName && BUILTIN_HOOKS.has(hookName)) {
        // Sobe ate a PRIMEIRA funcao que contem o hook (o "host").
        let cur = node.parent;
        let host = null;
        let hostParent = null;
        while (cur && !ts.isSourceFile(cur)) {
          if (ts.isFunctionLike(cur)) { host = cur; hostParent = cur.parent; break; }
          cur = cur.parent;
        }

        // O host e um callback aninhado (arrow/function expression passada como
        // ARGUMENTO) quando o proprio host nao e o corpo do componente/hook.
        // Ex.: useEffect(() => { useState(...) }) -> o host e a arrow.
        const hostIsExpression = ts.isArrowFunction(host) || ts.isFunctionExpression(host);
        const hostIsOwnBody = hostParent && (
          ts.isVariableDeclaration(hostParent)
          || ts.isPropertyDeclaration(hostParent)
          || ts.isPropertyAssignment(hostParent)
          || ts.isReturnStatement(hostParent)
          || ts.isExportAssignment(hostParent)
        );

        if (!host) {
          report(node, `HOOK FORA DE COMPONENTE: ${hookName}() no escopo de modulo (executa na importacao) -> React #321`);
        } else {
          const name = fnName(host, sf);
          const named = isComponentLike(name) || isCustomHook(name);
          if (!named) {
            // so aceita se for o corpo do proprio componente (nao um callback)
            if (hostIsExpression && !hostIsOwnBody) {
              report(node, `HOOK EM CALLBACK ANINHADO: ${hookName}() dentro de um callback (anônimo) de "${fnName(nearestNamedComponent(node, sf), sf) || '?'}" -> React #321`);
            } else if (name) {
              report(node, `HOOK EM FUNCAO NAO-COMPONENTE: ${hookName}() dentro de "${name}" -> React #321`);
            } else {
              report(node, `HOOK EM CALLBACK ANINHADO: ${hookName}() dentro de função anônima -> React #321`);
            }
          } else if (insideConditional(node, host)) {
            report(node, `HOOK EM CONDICIONAL/LOOP: ${hookName}() dentro de condicional em "${name}" -> ordem de hooks pode mudar -> React #321`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  /** O hook esta sob um if/loop/switch/ternario dentro do host? */
  function insideConditional(hookNode, host) {
    let cur = hookNode.parent;
    while (cur && cur !== host && !ts.isSourceFile(cur)) {
      if (ts.isIfStatement(cur) || ts.isForStatement(cur) || ts.isForOfStatement(cur)
        || ts.isForInStatement(cur) || ts.isWhileStatement(cur) || ts.isDoStatement(cur)
        || ts.isSwitchStatement(cur) || ts.isConditionalExpression(cur)
        || ts.isTryStatement(cur) || ts.isBinaryExpression(cur)) {
        return cur;
      }
      cur = cur.parent;
    }
    return null;
  }

  /** Componente nomeado mais externo que contem o no. */
  function nearestNamedComponent(node, sf2) {
    let cur = node.parent;
    let best = null;
    while (cur && !ts.isSourceFile(cur)) {
      if (ts.isFunctionLike(cur)) {
        const n = fnName(cur, sf2);
        if (isComponentLike(n) || isCustomHook(n)) best = cur;
      }
      cur = cur.parent;
    }
    return best;
  }

  visit(sf);
  return rel;
}

// Heuristica auxiliar: hooks dentro de useEffect/useMemo/useCallback no MESMO
// nivel do componente sao legais (ex.: const x = useMemo(...)).
// O problema real e hook dentro do CALLBACK interno. Detectamos pelo fato de o
// hook estar dentro de uma arrowfunction passada como argumento.

const files = [];
for (const d of SRC_DIRS) {
  const full = path.join(ROOT, d);
  if (fs.existsSync(full)) walkFiles(full, files);
}
const uniq = [...new Set(files.map((f) => path.resolve(f)))];

for (const f of uniq) {
  try { checkFile(f); } catch (e) { notes.push(`ERRO ao analisar ${path.relative(ROOT, f)}: ${e.message}`); }
}

console.log(`Arquivos analisados: ${uniq.length}`);
if (notes.length) { console.log('\nAvisos:'); notes.forEach((n) => console.log('  ' + n)); }
if (problems.length) {
  console.log(`\nVIOLACOES DE RULES OF HOOKS: ${problems.length}`);
  problems.forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('\nOK: nenhuma violacao de Rules of Hooks encontrada.');