# Despensa

Web app instalável no iPhone (PWA). Não precisa de build: são só arquivos estáticos.

## O que já funciona
- Leitor de código de barras com câmera, em dois modos: **Comprei +1** e **Acabou −1**. A leitura é contínua, com bip e botão de desfazer.
- Produto novo: o app busca o nome nas bases públicas Open Food/Beauty/Products Facts. Se não achar, você digita uma vez.
- Despensa agrupada por categoria, com busca, filtro, botões +/−, edição e exclusão.
- Quando um produto chega a 0, ele vai sozinho para a **lista de compras**.
- Lista de compras: marcar itens, adicionar itens à mão e "Guardar na despensa" (+1 em cada item marcado).
- Itens sem código de barras (frutas, carne, granel) entram pelo botão **+**.
- Backup: exportar e importar arquivo .json pela engrenagem.
- Funciona offline depois do primeiro acesso.

## Etapa 3: login e despensa compartilhada
- Login por e-mail e senha (Firebase Authentication).
- Uma "casa" por conta, com **código de convite** de 6 caracteres para a segunda pessoa entrar.
- Dados no Firestore, sincronizados em tempo real e funcionando offline (enviados quando a internet volta).
- Duas pessoas lendo o mesmo produto ao mesmo tempo: as quantidades somam, ninguém sobrescreve ninguém.
- Na primeira entrada, o app oferece enviar para a casa os produtos que estavam só no aparelho.
- Enquanto `firebase-config.js` estiver com `null`, o app continua no modo local.

Notas e Gastos aparecem como "em construção" (etapa 4).

## Configurar o Firebase (uma vez)
1. Em https://console.firebase.google.com, crie um projeto (o Google Analytics não é necessário).
2. **Authentication › Método de login › E-mail/senha** › Ativar › Salvar.
3. **Firestore Database › Criar banco de dados** › local `southamerica-east1 (São Paulo)` › modo de produção.
4. **Firestore › Regras**: cole o conteúdo de `firestore.rules` › Publicar.
5. **Configurações do projeto › Geral › Seus apps › Web (</>)** › registre o app e copie o objeto `firebaseConfig` para `firebase-config.js`.

O `firebaseConfig` não é segredo: quem protege os dados são as regras do Firestore.

## Publicar (Netlify, grátis)
A câmera só funciona em endereço **https**, então o app precisa estar publicado.

**Opção rápida:** acesse https://app.netlify.com/drop e arraste a pasta `despensa-app` inteira.

## Instalar no iPhone
1. Abra o link no **Safari**.
2. Toque em Compartilhar › **Adicionar à Tela de Início**.
3. Abra pelo ícone e permita a câmera quando o app pedir.

Se a câmera foi negada: Ajustes › Apps › Safari › Câmera › Permitir. Depois feche e abra o app de novo.

## Estrutura
- `index.html`, `styles.css`, `app.js`: o app.
- `store.js`: camada de dados (local ou Firestore).
- `firebase-config.js`: configuração do Firebase (null = modo local).
- `firestore.rules`: regras de segurança do Firestore.
- `sw.js`: cache offline. Ao publicar mudanças, aumente a versão na constante `CACHE`.
- `vendor/`: leitor de código (barcode-detector + zxing-wasm, MIT) e SDK do Firebase empacotado (Apache 2.0).
- `netlify.toml`: cabeçalhos de cache.
