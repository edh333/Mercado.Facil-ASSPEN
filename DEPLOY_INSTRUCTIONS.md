# Guia de Deploy Profissional — Firebase Hosting

## Pré-requisitos

- Node.js 18+ instalado
- Acesso ao projeto Firebase `mercado-facil-mt`
- Firebase CLI instalado (`npm install -g firebase-tools`)

## Passo a Passo

### 1. Instalar dependências e compilar

```bash
npm install
npm run build
```

O comando `npm run build` gera os arquivos finais na pasta `dist/`.

### 2. Deploy no Firebase Hosting

```bash
firebase deploy --only hosting
```

Se for o primeiro deploy no projeto, faça login:

```bash
firebase login
firebase init hosting   # Escolha "dist/" como pasta pública, configure como SPA
firebase deploy --only hosting
```

### 3. Verificar o deploy

Acesse a URL exibida no terminal (ex: `https://mercado-facil-mt.web.app`).

---

## Comandos Rápidos

| Ação | Comando |
|------|---------|
| Compilar para produção | `npm run build` |
| Deploy apenas hosting | `firebase deploy --only hosting` |
| Deploy completo (hosting + functions) | `firebase deploy` |
| Visualizar localmente | `npm run dev` (acesse http://localhost:5177) |

---

## Variáveis de Ambiente

O arquivo `.env` na raiz contém as credenciais do Firebase. **Nunca compartilhe este arquivo.** Para deploy, as variáveis são injetadas automaticamente pelo Vite durante o build.

---

## Observações Importantes

- Certifique-se de que as **regras do Firestore** (`firestore.rules`) estão atualizadas antes do deploy.
- A primeira compilação pode demorar alguns minutos.
- O cache do navegador pode exibir versão antiga — use **Ctrl+F5** para forçar atualização.
