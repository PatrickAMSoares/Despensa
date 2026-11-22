// Consulta a página pública da NFC-e na Secretaria da Fazenda e devolve o HTML para o app.
// Existe porque o navegador não pode ler páginas de outro site diretamente (bloqueio CORS).
// Só aceita endereços de Fazendas (.gov.br) com "nfce" no link, e só responde ao app da Despensa.

const ORIGENS = ['https://patrickamsoares.github.io', 'http://localhost:8765', 'http://127.0.0.1:8765'];

function charsetDe(tipo, bytes) {
  const m = /charset=([\w-]+)/i.exec(tipo || '');
  if (m) return m[1];
  const ini = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(ini);
  return meta ? meta[1] : 'utf-8';
}

export default async (req) => {
  const origem = req.headers.get('origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return new Response('Método não permitido', { status: 405, headers: cors });

  let alvo;
  try { alvo = new URL(new URL(req.url).searchParams.get('url') || ''); } catch { alvo = null; }
  if (!alvo || !/^https?:$/.test(alvo.protocol) || !alvo.hostname.endsWith('.gov.br') || !/nfc-?e/i.test(alvo.href)) {
    return new Response('Endereço de nota fiscal inválido', { status: 400, headers: cors });
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(alvo.href, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    clearTimeout(t);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let html;
    try { html = new TextDecoder(charsetDe(r.headers.get('content-type'), bytes)).decode(bytes); }
    catch { html = new TextDecoder('utf-8').decode(bytes); }
    return new Response(html, {
      status: r.ok ? 200 : 502,
      headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': r.ok ? 'public, max-age=86400' : 'no-store' },
    });
  } catch (e) {
    return new Response(`Falha ao consultar a Fazenda: ${e.name === 'AbortError' ? 'tempo esgotado' : e.message}`, { status: 504, headers: cors });
  }
};

export const config = { path: '/nfce' };
