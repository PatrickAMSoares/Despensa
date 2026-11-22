// Configuração do Firebase (etapa 3).
// Enquanto estiver null, o app funciona em modo local (dados só neste aparelho).
// Cole aqui o objeto firebaseConfig do Console do Firebase:
//   Configurações do projeto › Geral › Seus apps › App da Web › Configuração do SDK › "Config"
// Esses valores não são senha: a proteção dos dados vem das regras do Firestore (firestore.rules).
export const firebaseConfig = null;

// Endereço da função que consulta a nota fiscal na Fazenda (etapa 4), ex.:
//   'https://despensa-nfce.netlify.app/nfce'
// Enquanto estiver null, a leitura de notas fica desativada.
export const proxyNotas = 'https://despensa-nfce.netlify.app/nfce';
