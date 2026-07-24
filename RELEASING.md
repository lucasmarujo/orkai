# Como lançar uma nova versão

Guia do processo de release do Orkai — do bump de versão até o instalador disponível
para download na landing page.

## Visão geral

```
bump da versão  →  commit  →  git tag vX.Y.Z  →  git push --tags
                                       ↓
                       GitHub Actions (.github/workflows/release.yml)
                       npm ci → tauri build → renomeia os instaladores
                                       ↓
                       Release DRAFT criado com os 2 anexos
                                       ↓
                       você testa o instalador e clica em "Publish release"
                                       ↓
                       o botão da landing page passa a servir o novo .msi
```

Dois passos são manuais de propósito: **bumpar a versão** e **publicar o draft**. O resto
é automático.

---

## Passo 1 — Bumpe a versão

> **Este é o passo que mais dá errado.** A tag do git **não** define a versão do
> instalador. Quem nomeia o binário e aparece em Programas e Recursos é o
> `tauri.conf.json`. Taggear `v0.2.0` sem bumpar os arquivos gera um release `v0.2.0`
> contendo um instalador `0.1.0` — sem nenhum erro no caminho.

A versão vive em quatro arquivos e os quatro precisam bater:

| Arquivo | Campo |
|---|---|
| `apps/desktop/src-tauri/tauri.conf.json` | `"version"` |
| `Cargo.toml` | `[workspace.package] version` |
| `package.json` | `"version"` |
| `apps/desktop/package.json` | `"version"` |

O projeto segue [SemVer](https://semver.org): `MAJOR.MINOR.PATCH`.

```powershell
# Confere se os quatro estão iguais antes de taggear
Select-String -Path tauri.conf.json,Cargo.toml,package.json -Pattern 'version' | Select-Object -First 8
```

## Passo 2 — Rode a verificação local

O CI reprova em qualquer warning do clippy. Melhor descobrir antes:

```powershell
npm run lint
npm run typecheck
npm test

npm run build       # necessário antes do cargo: generate_context! lê o dist/
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Passo 3 — Commit, tag e push

A tag **precisa** ter o prefixo `v` — é o que dispara o workflow.

```powershell
git add -A
git commit -m "chore: versão 0.2.0"
git push

git tag v0.2.0
git push origin v0.2.0
```

## Passo 4 — Acompanhe o build

Em **Actions → Release** no GitHub. Roda em `windows-latest` e leva ~10-15 minutos
(compilação do Rust; o cache do `Swatinem/rust-cache` acelera as seguintes).

O workflow:

1. Instala Node 22 e a toolchain Rust
2. Remove o `.cargo/config.toml` (o `target-dir` dele só existe na sua máquina, fora do OneDrive)
3. Roda `npx tauri build` em `apps/desktop`
4. **Renomeia os instaladores para nomes sem versão** — é isso que mantém o link da landing page estável
5. Cria um release **draft** com changelog gerado a partir dos commits

## Passo 5 — Teste o instalador

Baixe o `.msi` do draft e instale numa máquina. Vale conferir:

- O instalador abre e conclui
- O app inicia e o ícone está correto
- A versão em Programas e Recursos bate com a tag

Se estiver quebrado, delete o draft e a tag — nada foi publicado ainda:

```powershell
git push --delete origin v0.2.0
git tag -d v0.2.0
```

## Passo 6 — Publique

No GitHub, abra o draft → revise o changelog → **Publish release**.

A partir desse clique o link da landing page passa a servir o novo instalador.
Nenhuma alteração de código é necessária.

---

## Como a landing page resolve o link

O botão de download aponta para um link permanente:

```
https://github.com/lucasmarujo/orkai/releases/latest/download/Orkai_x64_en-US.msi
```

O GitHub redireciona `/releases/latest/download/<arquivo>` para o asset de mesmo nome
da última release **publicada**. Por isso o workflow renomeia os bundles removendo a
versão do nome — se o arquivo se chamasse `Orkai_0.2.0_x64_en-US.msi`, o link quebraria
a cada release.

A versão continua visível na tag do release, nas propriedades do executável e em
Programas e Recursos. É só o nome do arquivo que é fixo.

Consequência: **releases em draft não contam.** A rota `/latest/` só enxerga releases
publicadas. Enquanto o draft não for publicado, o botão continua servindo a versão
anterior (ou dá 404, se não houver nenhuma).

## A primeira release

Ainda não há nenhuma release publicada, então o botão da landing page dá 404 hoje. Para
resolver, publique a `v0.1.0`:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Espere o workflow, teste o MSI do draft e publique. Pronto — o botão funciona daí em diante.

## Arquivos publicados

| Arquivo | Descrição |
|---|---|
| `Orkai_x64_en-US.msi` | Instalador MSI, para toda a máquina. Pede admin. É o que a landing page serve. |
| `Orkai_x64-setup.exe` | Instalador NSIS, por usuário. Não pede admin. |

## Problemas comuns

**O workflow não disparou.** A tag precisa começar com `v` (`v0.2.0`, não `0.2.0`), e
tags não sobem com `git push` sozinho — use `git push origin <tag>` ou `git push --tags`.

**O instalador saiu com a versão errada.** Você taggeou sem bumpar os quatro arquivos do
Passo 1. Corrija, delete a tag e refaça.

**O build falha só no CI.** Quase sempre é `cargo clippy -D warnings`, que o
`npm run tauri build` local não roda. Rode o bloco do Passo 2 antes de taggear.

**O botão da landing page dá 404.** Ou não há release publicada, ou o draft nunca foi
publicado, ou o nome do asset mudou. O nome tem que ser exatamente `Orkai_x64_en-US.msi`.

**O SmartScreen bloqueia o instalador.** Esperado — o binário não é assinado. Resolver
exige um certificado de code signing pago.

## Testando o workflow sem lançar

Em **Actions → Release → Run workflow** você dispara o build manualmente. Sem tag, o job
compila mas **não** cria release nenhum — serve só para checar se o build passa.

## Build local

Para gerar os instaladores na sua máquina, sem passar pelo CI:

```powershell
cd apps/desktop
npx tauri build
```

Saem em `C:\orkai-build\target\release\bundle\` (`msi\` e `nsis\`) — caminho definido
pelo `.cargo/config.toml`, que tira o `target/` do OneDrive porque a sincronização trava
a compilação. Aqui os nomes **mantêm** a versão; quem renomeia é o workflow.

## O que ainda não é automático

- **Bump de versão** — os quatro arquivos, na mão.
- **Assinatura de código** — sem certificado, todo release avisa no SmartScreen.
- **Auto-update no app** — o plugin `updater` do Tauri não está instalado; o usuário
  baixa e reinstala manualmente.
- **macOS e Linux** — os targets do bundle são só `msi` e `nsis`.
