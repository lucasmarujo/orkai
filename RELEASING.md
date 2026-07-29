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
| `latest.json` | Manifesto do auto-update. É o que o app instalado consulta no boot. |

## Auto-update

O app se atualiza sozinho. A cada boot ele lê o `latest.json` da última release; se a
versão de lá for maior que a instalada, pergunta ao usuário. Aceitando, o próprio app
baixa o `.msi`, valida a assinatura, roda o instalador e reinicia já atualizado — sem
passar pela landing page.

Recusando, ou estando na versão mais recente, nada aparece e o app abre direto. Falha de
rede também não bloqueia o boot: a checagem desiste em silêncio.

O `.msi` é o artefato servido de propósito, por ser o mesmo instalador da landing page —
usar o NSIS deixaria duas instalações do Orkai na máquina. O preço é o prompt do UAC
durante a atualização, que instalação para toda a máquina sempre exige.

### A chave de assinatura

O updater só aceita um pacote assinado com a chave cujo público está no
`tauri.conf.json` (`plugins.updater.pubkey`). O par vive fora do repositório:

| | |
|---|---|
| Privada | `~/.tauri/orkai-updater.key` — **backup obrigatório** |
| Pública | `~/.tauri/orkai-updater.key.pub` — já embutida no `tauri.conf.json` |

Perder a privada significa não conseguir mais atualizar quem já instalou: seria preciso
gerar outro par, publicar uma versão com o novo `pubkey` e fazer todo mundo reinstalar na
mão. Guarde em outro lugar.

Uma única secret no repositório (**Settings → Secrets and variables → Actions**) faz o
workflow assinar:

| Secret | Valor |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | conteúdo do arquivo `orkai-updater.key` |

```powershell
Get-Content $HOME\.tauri\orkai-updater.key -Raw | Set-Clipboard   # e cole na interface web
```

O workflow também passa `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, mas a chave foi gerada **sem
senha** e o GitHub não aceita secret de valor vazio — então essa secret não deve existir.
Secret inexistente resolve para string vazia, que é exatamente o que o CLI espera. Se um
dia a chave ganhar senha, basta criar a secret; o workflow não muda.

Sem a secret da chave privada o passo `Gerar latest.json do updater` falha o build — de
propósito. Uma release sem assinatura sairia com o botão de download funcionando e o
auto-update quebrado em silêncio, o pior dos dois mundos.

## A primeira release

Ainda não há release publicada, então o botão da landing page dá 404 hoje. A versão atual
nunca foi lançada, então basta subir qualquer mudança no app — ou disparar o workflow na mão
em **Actions → Release → Run workflow**, que também respeita o gate de versão.

O auto-update só se prova da segunda release em diante: a primeira não tem versão anterior
de onde sair.

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

**O app não oferece a atualização.** Confira se o `latest.json` está entre os assets da
release e se a versão dentro dele é maior que a instalada. Se o app baixa mas recusa
instalar, a assinatura não bate com o `pubkey` do `tauri.conf.json` — sinal de que a secret
`TAURI_SIGNING_PRIVATE_KEY` é de outro par de chaves.

## Build local

Para gerar os instaladores na sua máquina, sem passar pelo CI:

```powershell
cd apps/desktop
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $HOME\.tauri\orkai-updater.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
npx tauri build
```

As duas variáveis são obrigatórias desde o auto-update: com `pubkey` no `tauri.conf.json`
e sem chave privada, o build gera os instaladores e **falha** ao assinar. Note que é o
*conteúdo* da chave — o CLI 2.x ignora `TAURI_SIGNING_PRIVATE_KEY_PATH`. A de senha tem que
existir mesmo vazia: sem ela o CLI abre um prompt e o build fica travado esperando.

Saem em `C:\orkai-build\target\release\bundle\` (`msi\` e `nsis\`) — caminho definido pelo
`.cargo/config.toml`, que tira o `target/` do OneDrive porque a sincronização trava a
compilação. Aqui os nomes **mantêm** a versão; quem renomeia é o workflow.

## O que ainda não é automático

- **Bump de versão** — os quatro arquivos, na mão. É de propósito: é o gate que impede
  uma release por commit.
- **Assinatura de código** — sem certificado, todo release avisa no SmartScreen. Vale para
  o auto-update também: o instalador baixado pelo app pode disparar o aviso.
- **macOS e Linux** — os targets do bundle são só `msi` e `nsis`.
