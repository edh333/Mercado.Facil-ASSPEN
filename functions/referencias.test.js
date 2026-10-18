// Guard permanente contra a classe de bug que JÁ quebrou produção 2x:
//   1) fiadoExcedeLimite — usado e nunca importado de ./logic  (vendas fiado)
//   2) dataDiaLocalSP() — typo do helper real dataDiaLocalMT  (compra no app + PIX)
//
// Em ambos o sintoma foi um ReferenceError engolido pelo catch e virado um
// HttpsError("internal") genérico. Este teste faz varredura estática em index.js:
// todo identificador chamado como função precisa existir (declarado, importado
// ou builtin), senão a venda/compra quebra em runtime de novo.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexJs = fileURLToPath(new URL("./index.js", import.meta.url));

/** Remove comentários, strings, templates e literais regex antes da análise
 *  — senão palavras dentro de mensagens PT-BR viram falso positivo. */
function stripLiterals(code) {
  let out = "";
  let i = 0;
  const n = code.length;
  // Último token significativo, para distinguir `/regex/` de divisão.
  let prevSig = "";

  const isRegexContext = (p) => p === "" || "([,=:;!&|?{;+-*%<>^~".includes(p);

  while (i < n) {
    const c = code[i];
    const next = code[i + 1];

    if (c === "/" && next === "/") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      i++;
      while (i < n) {
        if (code[i] === "\\") { i += 2; continue; }
        if (code[i] === q) { i++; break; }
        i++;
      }
      out += " ";
      continue;
    }
    if (c === "/" && isRegexContext(prevSig)) {
      i++;
      let inClass = false;
      while (i < n) {
        if (code[i] === "\\") { i += 2; continue; }
        if (code[i] === "[") inClass = true;
        else if (code[i] === "]") inClass = false;
        else if (code[i] === "/" && !inClass) { i++; break; }
        i++;
      }
      out += " ";
      prevSig = "/";
      continue;
    }
    if (!/\s/.test(c)) prevSig = c;
    out += c;
    i++;
  }
  return out;
}

function declaredNames(code) {
  const declared = new Set();
  for (const m of code.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(/g)) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim().split(":").pop().trim();
      if (name) declared.add(name);
    }
  }
  for (const m of code.matchAll(/(?:function|async function)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) declared.add(m[1]);
  for (const m of code.matchAll(/exports\.([A-Za-z_$][\w$]*)\s*=/g)) declared.add(m[1]);
  for (const m of code.matchAll(/(?:class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  return declared;
}

const BUILTINS = new Set([
  "if", "for", "while", "switch", "catch", "return", "typeof", "function", "new",
  "await", "require", "console", "Math", "Number", "String", "JSON", "Promise",
  "Object", "Array", "RegExp", "Date", "Error", "Boolean", "parseInt", "parseFloat",
  "isNaN", "isFinite", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "Buffer", "process", "module", "exports", "void", "delete", "in", "of", "do",
  "else", "try", "throw", "async", "yield", "class", "extends", "super", "this",
  "arguments", "NaN", "Infinity", "encodeURIComponent", "decodeURIComponent",
  "fetch", "URL", "Set", "Map", "AbortController", "__name__", "true", "false",
  "TextEncoder", "TextDecoder", "URLSearchParams", "Intl", "Reflect", "Proxy",
  "BigInt", "Symbol", "structuredClone",
]);

describe("guard estático: nenhum identificador chamado sem existir em index.js", () => {
  const code = stripLiterals(readFileSync(indexJs, "utf8"));
  const declared = declaredNames(code);

  const called = new Set();
  for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) called.add(m[1]);

  const missing = [...called].filter((name) => !declared.has(name) && !BUILTINS.has(name));

  it("não existe referência a função inexistente (evita ReferenceError em runtime)", () => {
    expect(missing, `Identificadores chamados mas não declarados/importados em index.js:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("a varredura pegou o bug histórico fiadoExcedeLimite (sanidade do guard)", () => {
    // Se alguém remover o import de novo, o guard acima falha. Aqui garantimos
    // que o nome está de fato presente — ou seja, o guard é sensível a ele.
    expect(declared.has("fiadoExcedeLimite")).toBe(true);
    expect(declared.has("dataDiaLocalMT")).toBe(true);
  });
});
