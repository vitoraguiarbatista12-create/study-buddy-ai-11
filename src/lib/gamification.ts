// Sistema de gamificação — XP, níveis e conquistas

export interface Conquista {
  id: string;
  nome: string;
  descricao: string;
  emoji: string;
  cor: string;
  verificar: (stats: GamStats) => boolean;
}

export interface GamStats {
  totalQuizzes: number;
  totalAcertos: number;
  totalErros: number;
  melhorNota: number;
  streak: number;
  totalMaterias: number;
  notasAcima8: number;
  notasAbaixo5: number;
  quizzesHoje: number;
}

export const calcularXP = (stats: GamStats): number => {
  return (
    stats.totalAcertos * 10 +
    stats.totalQuizzes * 20 +
    stats.notasAcima8 * 50 +
    stats.streak * 15
  );
};

export const NIVEIS = [
  { nivel: 1, nome: "Iniciante",     xpMin: 0,    xpMax: 100,  emoji: "📖" },
  { nivel: 2, nome: "Estudante",     xpMin: 100,  xpMax: 300,  emoji: "✏️" },
  { nivel: 3, nome: "Dedicado",      xpMin: 300,  xpMax: 600,  emoji: "🎯" },
  { nivel: 4, nome: "Aplicado",      xpMin: 600,  xpMax: 1000, emoji: "⚡" },
  { nivel: 5, nome: "Especialista",  xpMin: 1000, xpMax: 1500, emoji: "🔥" },
  { nivel: 6, nome: "Mestre",        xpMin: 1500, xpMax: 2500, emoji: "🏆" },
  { nivel: 7, nome: "Gênio",         xpMin: 2500, xpMax: 4000, emoji: "🧠" },
  { nivel: 8, nome: "Lenda",         xpMin: 4000, xpMax: 9999, emoji: "⭐" },
];

export const getNivel = (xp: number) => {
  return NIVEIS.slice().reverse().find((n) => xp >= n.xpMin) || NIVEIS[0];
};

export const getProgressoNivel = (xp: number) => {
  const nivel = getNivel(xp);
  const range = nivel.xpMax - nivel.xpMin;
  const progress = xp - nivel.xpMin;
  return Math.min((progress / range) * 100, 100);
};

export const CONQUISTAS: Conquista[] = [
  {
    id: "primeiro_quiz",
    nome: "Primeiro Passo",
    descricao: "Complete seu primeiro quiz",
    emoji: "🎉",
    cor: "text-blue-500",
    verificar: (s) => s.totalQuizzes >= 1,
  },
  {
    id: "cinco_quizzes",
    nome: "Em Ritmo",
    descricao: "Complete 5 quizzes",
    emoji: "🚀",
    cor: "text-indigo-500",
    verificar: (s) => s.totalQuizzes >= 5,
  },
  {
    id: "vinte_quizzes",
    nome: "Maratonista",
    descricao: "Complete 20 quizzes",
    emoji: "🏃",
    cor: "text-purple-500",
    verificar: (s) => s.totalQuizzes >= 20,
  },
  {
    id: "nota_dez",
    nome: "Perfeição",
    descricao: "Tire 10 em um quiz",
    emoji: "💯",
    cor: "text-yellow-500",
    verificar: (s) => s.melhorNota >= 10,
  },
  {
    id: "nota_acima_8",
    nome: "Nota Alta",
    descricao: "Tire acima de 8 em um quiz",
    emoji: "⭐",
    cor: "text-amber-500",
    verificar: (s) => s.notasAcima8 >= 1,
  },
  {
    id: "tres_notas_acima_8",
    nome: "Consistente",
    descricao: "Tire acima de 8 em 3 quizzes",
    emoji: "🎯",
    cor: "text-green-500",
    verificar: (s) => s.notasAcima8 >= 3,
  },
  {
    id: "streak_3",
    nome: "Sequência",
    descricao: "Estude 3 dias seguidos",
    emoji: "🔥",
    cor: "text-orange-500",
    verificar: (s) => s.streak >= 3,
  },
  {
    id: "streak_7",
    nome: "Imparável",
    descricao: "Estude 7 dias seguidos",
    emoji: "⚡",
    cor: "text-orange-600",
    verificar: (s) => s.streak >= 7,
  },
  {
    id: "tres_materias",
    nome: "Multidisciplinar",
    descricao: "Crie 3 matérias diferentes",
    emoji: "📚",
    cor: "text-cyan-500",
    verificar: (s) => s.totalMaterias >= 3,
  },
  {
    id: "cem_acertos",
    nome: "Centenário",
    descricao: "Acumule 100 acertos no total",
    emoji: "🏅",
    cor: "text-rose-500",
    verificar: (s) => s.totalAcertos >= 100,
  },
  {
    id: "virada",
    nome: "Virada de Jogo",
    descricao: "Tire 8+ depois de tirar abaixo de 5",
    emoji: "💪",
    cor: "text-emerald-500",
    verificar: (s) => s.notasAbaixo5 >= 1 && s.notasAcima8 >= 1,
  },
  {
    id: "quiz_hoje",
    nome: "Dedicação Diária",
    descricao: "Faça 3 quizzes em um único dia",
    emoji: "☀️",
    cor: "text-yellow-400",
    verificar: (s) => s.quizzesHoje >= 3,
  },
];
