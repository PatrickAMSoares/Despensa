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
    'Cache-Control': 'no-store', // cada link é uma nota diferente: nunca reaproveitar resposta
    'Netlify-Vary': 'query',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return new Response('Método não permitido', { status: 405, headers: cors });

  const params = new URL(req.url).searchParams;
  if (params.has('ping')) return new Response('ok', { headers: cors });
  const diagnostico = params.has('diag'); // devolve só o status e o início da resposta da Fazenda

  // Aceita o link completo (?url=) ou só o parâmetro p do QR Code de Santa Catarina (?p=chave|2|1|1|hash)
  let alvo;
  const p = params.get('p');
  // fonte=svrs: consulta na Sefaz Virtual do RS, que autoriza as NFC-e de SC e de outros estados
  if (p && /^\d{44}(\|[\w]*)*$/.test(p) && params.get('fonte') === 'svrs') alvo = new URL(`https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=${p}`);
  else if (p && /^42\d{42}\|/.test(p)) alvo = new URL(`https://sat.sef.sc.gov.br/nfce/consulta?p=${p}`);
  else { try { alvo = new URL(params.get('url') || ''); } catch { alvo = null; } }
  if (!alvo || !/^https?:$/.test(alvo.protocol) || !alvo.hostname.endsWith('.gov.br') || !/nfc-?e/i.test(alvo.href)) {
    return new Response(`Endereço de nota fiscal inválido${diagnostico ? `\nrecebido: ${req.url}` : ''}`, { status: diagnostico ? 200 : 400, headers: cors });
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
    if (diagnostico) {
      const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500);
      return new Response(`status da Fazenda: ${r.status}\nendereço final: ${r.url}\ntamanho: ${html.length}\ntem tabResult: ${/tabResult/.test(html)}\n\n${texto}`, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return new Response(html, {
      status: r.ok ? 200 : 502,
      headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(`Falha ao consultar a Fazenda: ${e.name === 'AbortError' ? 'tempo esgotado' : e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}`, { status: diagnostico ? 200 : 504, headers: cors });
  }
};

export const config = { path: '/nfce' };
