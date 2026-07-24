# Como lançar uma nova versão

Guia do processo de release do Orkai — do bump de versão até o instalador disponível
para download na landing page.

## Visão geral

Não existe passo de tag manual. O gatilho é o **bump de versão**:

```
bumpa a versão  →  commit  →  git push
                                  ↓
              o workflow lê a versão do tauri.conf.json
                                  ↓
                    já existe a tag dessa versão?
                       ↓                    ↓
                     sim                   não
                       ↓                    ↓
                não faz nada        build → tag → release publicada
                                             ↓
                            o botão da landing page serve o novo .msi
```

Push sem mexer na versão apenas passa batido. É o bump que decide se sai release.

O workflow também ignora mudanças que não são do app: mexer só em `landing-page/`,
`docs/`, `plans/` ou nos `.md` da raiz não dispara nada.

---

## Lançando

### 1. Bumpe a versão

A versão vive em quatro arquivos e os quatro precisam bater. Quem nomeia o instalador
e aparece em Programas e Recursos é o `tauri.conf.json` — os outros são metadado, mas
deixá-los fora de sincronia confunde.

| Arquivo | Campo |
|---|---|
| `apps/desktop/src-tauri/tauri.conf.json` | `"version"` ← **é este que o workflow lê** |
| `Cargo.toml` | `[workspace.package] version` |
| `package.json` | `"version"` |
| `apps/desktop/package.json` | `"version"` |

O projeto segue [SemVer](https://semver.org): `MAJOR.MINOR.PATCH`.

### 2. Rode a verificação local

O CI de PR reprova em qualquer warning do clippy. Melhor descobrir antes:

```powershell
npm run lint
npm run typecheck
npm test

npm run build       # necessário antes do cargo: generate_context! lê o dist/
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

### 3. Commit e push

```powershell
git add -A
git commit -m "chore: versão 0.2.0"
git push
```

Só isso. A tag `v0.2.0` é criada pelo próprio workflow.

### 4. Acompanhe

Em **Actions → Release**. O job `check` roda em segundos e decide; se a versão for
inédita, o `windows` builda em ~10-15 minutos (compilação do Rust; o cache do
`Swatinem/rust-cache` acelera as seguintes).

Ao final o release aparece **publicado**, com changelog gerado a partir dos commits, e o
botão da landing page já serve o novo instalador.

---

## Como o gatilho funciona

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'apps/desktop/**'
      - 'crates/**'
      - 'Cargo.toml'
      - 'Cargo.lock'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/release.yml'
```

Passou pelo filtro de paths, o job `check` lê a versão do `tauri.conf.json` e testa se a
tag `v<versão>` já existe:

- **Já existe** → o job `windows` é pulado. Nenhum build, nenhum release.
- **Não existe** → builda, cria a tag apontando para o commit e publica o release.

Por isso você pode empurrar quantos commits quiser no app sem gerar release nenhum. A
release sai no primeiro push depois do bump.

Para incluir ou excluir o que conta como "mudança no app", edite a lista de `paths`.

## Publicação imediata vs. draft

Hoje o release sai **publicado direto** — o bump de versão já é o sinal deliberado de que
você quer lançar, então exigir um clique a mais só cria a chance de esquecer e deixar a
landing page servindo a versão velha.

O custo é que o instalador vai ao público sem você ter testado. Se preferir revisar antes,
adicione uma linha ao passo de release em `.github/workflows/release.yml`:

```yaml
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ needs.check.outputs.version }}
          draft: true        # ← release fica em rascunho até você clicar em Publish
```

Atenção: enquanto o draft não for publicado, a rota `/releases/latest/` não o enxerga e o
botão da landing page continua servindo a versão anterior.

## Como a landing page resolve o link

O botão aponta para um link permanente:

```
https://github.com/lucasmarujo/orkai/releases/latest/download/Orkai_x64_en-US.msi
```

O GitHub redireciona `/releases/latest/download/<arquivo>` para o asset de mesmo nome da
última release publicada. Por isso o workflow renomeia os bundles tirando a versão do
nome — se o arquivo se chamasse `Orkai_0.2.0_x64_en-US.msi`, o link quebraria a cada
release.

A versão continua visível na tag, nas propriedades do executável e em Programas e
Recursos. É só o nome do arquivo que é fixo.

## Arquivos publicados

| Arquivo | Descrição |
|---|---|
| `Orkai_x64_en-US.msi` | Instalador MSI, para toda a máquina. Pede admin. É o que a landing page serve. |
| `Orkai_x64-setup.exe` | Instalador NSIS, por usuário. Não pede admin. |

## A primeira release

Ainda não há release publicada, então o botão da landing page dá 404 hoje. A versão atual
(`0.1.0`) nunca foi lançada, então basta subir qualquer mudança no app — ou disparar o
workflow na mão em **Actions → Release → Run workflow**, que também respeita o gate de
versão.

## Desfazendo uma release

Como a publicação é imediata, corrigir significa lançar por cima. Delete o release e a
tag no GitHub, ou — melhor — bumpe para a versão seguinte e empurre:

```powershell
git push --delete origin v0.2.0    # se realmente quiser apagar
```

## Problemas comuns

**Empurrei e não saiu release.** Provavelmente a versão do `tauri.conf.json` não mudou —
a tag já existe e o job `windows` é pulado. Confira o resumo do job `check`, que registra
qual versão leu. A outra causa é o filtro de paths: mudança só em `landing-page/` ou nos
`.md` não dispara nada.

**Saiu release, mas com a versão errada.** O workflow lê exclusivamente o
`tauri.conf.json`. Se os outros três arquivos ficaram para trás, o release está certo e o
metadado é que está fora de sincronia.

**O build falha só no CI.** Quase sempre é `cargo clippy -D warnings`, que o
`npm run tauri build` local não roda. Rode o bloco de verificação antes de empurrar.

**O botão da landing page dá 404.** Ou não há release publicada, ou o nome do asset mudou.
Tem que ser exatamente `Orkai_x64_en-US.msi`.

**O SmartScreen bloqueia o instalador.** Esperado — o binário não é assinado. Resolver
exige um certificado de code signing pago.

## Build local

Para gerar os instaladores na sua máquina, sem passar pelo CI:

```powershell
cd apps/desktop
npx tauri build
```

Saem em `C:\orkai-build\target\release\bundle\` (`msi\` e `nsis\`) — caminho definido pelo
`.cargo/config.toml`, que tira o `target/` do OneDrive porque a sincronização trava a
compilação. Aqui os nomes **mantêm** a versão; quem renomeia é o workflow.

## O que ainda não é automático

- **Bump de versão** — os quatro arquivos, na mão. É de propósito: é o gate que impede
  uma release por commit.
- **Assinatura de código** — sem certificado, todo release avisa no SmartScreen.
- **Auto-update no app** — o plugin `updater` do Tauri não está instalado; o usuário baixa
  e reinstala manualmente.
- **macOS e Linux** — os targets do bundle são só `msi` e `nsis`.
