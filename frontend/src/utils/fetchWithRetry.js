/**
 * Roda uma chamada de API com retry automático (backoff simples) - pensado pra chamadas de
 * carregamento INICIAL de tela (lista de servidores, canais...) que, se falhassem uma vez por
 * um soluço de rede, deixavam a tela vazia pra sempre (ex: "nenhum servidor liberado") até a
 * pessoa deslogar/logar de novo pra tentar de novo (reportado pelo usuário - bate com a
 * instabilidade de rede da VPS por trás, ver DEPLOY.md/CPU steal). 3 tentativas por padrão,
 * espera crescente entre elas (1.5s, 3s).
 */
export async function fetchWithRetry(fn, { attempts = 3, delayMs = 1500 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}
