// Leitura da foto da nota fiscal no próprio celular (OCR com Tesseract, sem enviar a imagem para lugar nenhum).

let worker = null;

async function obterWorker(aoProgredir) {
  if (worker) return worker;
  if (!window.Tesseract) {
    await new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = 'vendor/tesseract/tesseract.min.js';
      s.onload = ok;
      s.onerror = () => erro(new Error('Não consegui carregar o leitor de texto.'));
      document.head.appendChild(s);
    });
  }
  const base = new URL('vendor/', location.href).href;
  worker = await window.Tesseract.createWorker('por', 1, {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract/`,
    langPath: `${base}tessdata`,
    gzip: true,
    logger: (m) => {
      if (aoProgredir && m.status === 'recognizing text') aoProgredir(m.progress);
    },
  });
  await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  return worker;
}

// Reduz para no máximo 2000 px, converte para cinza e estica o contraste (papel térmico costuma ser apagado)
async function prepararImagem(arquivo) {
  let img;
  try { img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); }
  catch {
    img = await new Promise((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error('Imagem inválida.'));
      i.src = URL.createObjectURL(arquivo);
    });
  }
  const w0 = img.width, h0 = img.height;
  const esc = Math.min(1, 2000 / Math.max(w0, h0));
  const w = Math.round(w0 * esc), h = Math.round(h0 * esc);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const dados = ctx.getImageData(0, 0, w, h);
  const px = dados.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
    px[i] = g;
    hist[g]++;
  }
  // contraste: ignora 1% mais escuro e 1% mais claro
  const total = w * h;
  let acum = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acum += hist[v]; if (acum > total * 0.01) { lo = v; break; } }
  acum = 0;
  for (let v = 255; v >= 0; v--) { acum += hist[v]; if (acum > total * 0.01) { hi = v; break; } }
  const fator = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.max(0, Math.min(255, (px[i] - lo) * fator));
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(dados, 0, 0);
  return c;
}

// Lê uma ou mais fotos (nota longa) e devolve o texto de todas, em ordem
export async function lerFotos(arquivos, aoProgredir = () => {}) {
  aoProgredir(0, 'Preparando o leitor…');
  const n = arquivos.length;
  let atual = 0;
  const w = await obterWorker((p) => aoProgredir((atual + p) / n, `Lendo a foto ${atual + 1} de ${n}…`));
  const textos = [];
  for (atual = 0; atual < n; atual++) {
    aoProgredir(atual / n, `Lendo a foto ${atual + 1} de ${n}…`);
    const canvas = await prepararImagem(arquivos[atual]);
    const r = await w.recognize(canvas);
    textos.push(r.data.text || '');
  }
  aoProgredir(1, 'Pronto');
  return textos.join('\n');
}
