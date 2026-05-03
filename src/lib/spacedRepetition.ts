// Algoritmo SM-2 de repetição espaçada (base do Anki)
// Referência: https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method

export interface CartaoRevisao {
  materiaId: string;
  materiaNome: string;
  intervaloDias: number;      // intervalo atual em dias
  facilidade: number;         // fator de facilidade (começa em 2.5)
  repeticoes: number;         // quantas vezes já revisou com sucesso
  proximaRevisao: string;     // ISO date
  ultimaNota: number;         // 0-10
}

/**
 * Calcula o próximo intervalo usando SM-2
 * nota: 0-10 (nota do quiz)
 */
export const calcularProximaRevisao = (cartao: CartaoRevisao, nota: number): CartaoRevisao => {
  // Converte nota 0-10 para qualidade SM-2 (0-5)
  // < 5  = esqueceu (qualidade 0-2)
  // 5-7  = lembrou com dificuldade (qualidade 3)
  // 7-9  = lembrou bem (qualidade 4)
  // 9-10 = perfeito (qualidade 5)
  let q: number;
  if (nota < 5) q = Math.floor(nota / 2.5);      // 0, 1
  else if (nota < 7) q = 3;
  else if (nota < 9) q = 4;
  else q = 5;

  let { intervaloDias, facilidade, repeticoes } = cartao;

  if (q < 3) {
    // Esqueceu — resetar
    repeticoes = 0;
    intervaloDias = 1;
  } else {
    // Lembrou — avançar
    if (repeticoes === 0) intervaloDias = 1;
    else if (repeticoes === 1) intervaloDias = 3;
    else intervaloDias = Math.round(intervaloDias * facilidade);

    repeticoes += 1;
  }

  // Atualiza fator de facilidade
  facilidade = Math.max(1.3, facilidade + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

  // Calcula próxima data
  const proxima = new Date();
  proxima.setDate(proxima.getDate() + intervaloDias);

  return {
    ...cartao,
    intervaloDias,
    facilidade,
    repeticoes,
    ultimaNota: nota,
    proximaRevisao: proxima.toISOString().split("T")[0],
  };
};

/**
 * Cria um cartão novo para uma matéria após o primeiro quiz
 */
export const criarCartao = (materiaId: string, materiaNome: string, nota: number): CartaoRevisao => {
  const base: CartaoRevisao = {
    materiaId,
    materiaNome,
    intervaloDias: 1,
    facilidade: 2.5,
    repeticoes: 0,
    proximaRevisao: new Date().toISOString().split("T")[0],
    ultimaNota: nota,
  };
  return calcularProximaRevisao(base, nota);
};

/**
 * Verifica se uma revisão está pendente hoje ou atrasada
 */
export const revisaoPendente = (proximaRevisao: string): boolean => {
  const hoje = new Date().toISOString().split("T")[0];
  return proximaRevisao <= hoje;
};

/**
 * Dias de atraso (negativo = ainda não chegou)
 */
export const diasAtraso = (proximaRevisao: string): number => {
  const hoje = new Date();
  const data = new Date(proximaRevisao);
  const diff = Math.floor((hoje.getTime() - data.getTime()) / 86400000);
  return diff;
};

/**
 * Label do intervalo para exibição
 */
export const labelIntervalo = (dias: number): string => {
  if (dias === 1) return "amanhã";
  if (dias < 7) return `em ${dias} dias`;
  if (dias === 7) return "em 1 semana";
  if (dias < 30) return `em ${Math.round(dias / 7)} semanas`;
  return `em ${Math.round(dias / 30)} meses`;
};
