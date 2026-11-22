# Despensa: MVP local (etapa 2)

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

## Limites desta etapa
- Os dados ficam **só no aparelho** (localStorage). Não há sincronização entre os dois celulares, isso é a etapa 3.
- Notas e Gastos aparecem como "em construção" (etapa 4).

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
- `sw.js`: cache offline. Ao publicar mudanças, aumente a versão na constante `CACHE`.
- `vendor/`: leitor de código (barcode-detector + zxing-wasm, licença MIT).
- `netlify.toml`: cabeçalhos de cache.
