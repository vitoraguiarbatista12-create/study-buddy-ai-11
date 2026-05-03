import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, Brain, Loader2, Calendar, CheckCircle,
  Clock, Zap, TrendingUp, BookOpen, RefreshCw
} from "lucide-react";
import { calcularProximaRevisao, diasAtraso, labelIntervalo, type CartaoRevisao } from "@/lib/spacedRepetition";

interface RevisaoPendente {
  id: string;
  materia_id: string;
  materiaNome: string;
  intervalo_dias: number;
  facilidade: number;
  repeticoes: number;
  ultima_nota: number;
  proxima_revisao: string;
}

type Fase = "lista" | "quiz" | "resultado_materia" | "completo";

const RevisaoEspacadaPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [revisoes, setRevisoes] = useState<RevisaoPendente[]>([]);
  const [fase, setFase] = useState<Fase>("lista");

  // Quiz state
  const [materiaAtual, setMateriaAtual] = useState<RevisaoPendente | null>(null);
  const [questoes, setQuestoes] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [gerandoQuestoes, setGerandoQuestoes] = useState(false);
  const [resultadoMateria, setResultadoMateria] = useState<{ nota: number; acertos: number; total: number } | null>(null);
  const [revisoesCompletas, setRevisoesCompletas] = useState<Array<{ nome: string; nota: number; proximo: string }>>([]);
  const [indiceMateria, setIndiceMateria] = useState(0);

  useEffect(() => {
    fetchRevisoes();
  }, []);

  const fetchRevisoes = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("revisoes_agendadas")
      .select("*, materias(nome)")
      .eq("user_id", user!.id)
      .lte("proxima_revisao", hoje)
      .order("proxima_revisao", { ascending: true });

    if (data) {
      setRevisoes(data.map((r: any) => ({
        ...r,
        materiaNome: r.materias?.nome || "Matéria",
      })));
    }
    setLoading(false);
  };

  const iniciarRevisaoMateria = async (revisao: RevisaoPendente, idx: number) => {
    setMateriaAtual(revisao);
    setIndiceMateria(idx);
    setGerandoQuestoes(true);
    setFase("quiz");
    setCurrentIdx(0);
    setRespostas({});
    setSelected(null);
    setAnswered(false);

    try {
      // Busca texto dos PDFs da matéria
      const { data: docs } = await supabase
        .from("documentos")
        .select("texto_extraido")
        .eq("materia_id", revisao.materia_id);

      const texto = (docs || []).map((d: any) => d.texto_extraido).filter(Boolean).join("\n\n");

      if (!texto.trim()) {
        toast.error("Nenhum PDF encontrado para esta matéria");
        setFase("lista");
        setGerandoQuestoes(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("gerar-questoes", {
        body: {
          texto: texto.substring(0, 15000),
          notaDesejada: revisao.ultima_nota < 6 ? 5 : 7, // mais fácil se foi mal
          materiaId: revisao.materia_id,
          qtdQuestoes: 5, // sempre 5 questões na revisão
        },
      });

      if (error) throw error;

      // Busca as questões geradas
      const { data: questoesData } = await supabase
        .from("questoes")
        .select("*")
        .eq("resultado_id", data.resultadoId)
        .limit(5);

      if (questoesData) {
        setQuestoes(questoesData.map((q: any) => ({
          ...q,
          alternativas: Array.isArray(q.alternativas) ? q.alternativas : JSON.parse(q.alternativas),
        })));
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar questões de revisão");
      setFase("lista");
    }
    setGerandoQuestoes(false);
  };

  const handleConfirm = () => {
    if (!selected) return;
    setAnswered(true);
    const q = questoes[currentIdx];
    setRespostas(prev => ({ ...prev, [q.id]: selected }));
  };

  const handleNext = async () => {
    if (currentIdx < questoes.length - 1) {
      setCurrentIdx(i => i + 1);
      setSelected(null);
      setAnswered(false);
    } else {
      // Terminou as 5 questões desta matéria
      await finalizarMateria();
    }
  };

  const finalizarMateria = async () => {
    const allRespostas = { ...respostas };
    if (selected) allRespostas[questoes[currentIdx]?.id] = selected;

    let acertos = 0;
    questoes.forEach(q => {
      if (allRespostas[q.id] === q.resposta_correta) acertos++;
    });

    const nota = (acertos / questoes.length) * 10;
    setResultadoMateria({ nota, acertos, total: questoes.length });

    // Atualiza SM-2
    const cartaoAtual: CartaoRevisao = {
      materiaId: materiaAtual!.materia_id,
      materiaNome: materiaAtual!.materiaNome,
      intervaloDias: materiaAtual!.intervalo_dias,
      facilidade: materiaAtual!.facilidade,
      repeticoes: materiaAtual!.repeticoes,
      ultimaNota: materiaAtual!.ultima_nota,
      proximaRevisao: materiaAtual!.proxima_revisao,
    };

    const atualizado = calcularProximaRevisao(cartaoAtual, nota);

    await supabase
      .from("revisoes_agendadas")
      .update({
        intervalo_dias: atualizado.intervaloDias,
        facilidade: atualizado.facilidade,
        repeticoes: atualizado.repeticoes,
        ultima_nota: nota,
        proxima_revisao: atualizado.proximaRevisao,
        updated_at: new Date().toISOString(),
      })
      .eq("id", materiaAtual!.id);

    setRevisoesCompletas(prev => [...prev, {
      nome: materiaAtual!.materiaNome,
      nota,
      proximo: labelIntervalo(atualizado.intervaloDias),
    }]);

    setFase("resultado_materia");
  };

  const proximaMateria = () => {
    const proxIdx = indiceMateria + 1;
    if (proxIdx < revisoes.length) {
      iniciarRevisaoMateria(revisoes[proxIdx], proxIdx);
    } else {
      setFase("completo");
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  // Tela: lista de revisões pendentes
  if (fase === "lista") {
    if (revisoes.length === 0) return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 px-4 py-3">
          <div className="container mx-auto max-w-2xl flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}><ArrowLeft className="w-5 h-5" /></Button>
            <h1 className="text-xl font-bold font-display">Revisões do Dia</h1>
          </div>
        </header>
        <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-xl font-bold font-display mb-2">Tudo em dia!</h2>
          <p className="text-muted-foreground mb-6">Você não tem revisões pendentes hoje. Volte amanhã!</p>
          <Button variant="hero" onClick={() => navigate("/dashboard")}>Voltar ao Dashboard</Button>
        </div>
      </div>
    );

    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 px-4 py-3">
          <div className="container mx-auto max-w-2xl flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}><ArrowLeft className="w-5 h-5" /></Button>
            <div>
              <h1 className="text-xl font-bold font-display">Revisões do Dia</h1>
              <p className="text-xs text-muted-foreground">{revisoes.length} matéria{revisoes.length !== 1 ? "s" : ""} para revisar</p>
            </div>
          </div>
        </header>

        <main className="container mx-auto max-w-2xl px-4 py-8 space-y-4">
          <Card className="shadow-card border-primary/20 bg-primary/5">
            <CardContent className="py-4 flex items-center gap-3">
              <Brain className="w-8 h-8 text-primary shrink-0" />
              <div>
                <p className="font-semibold font-display text-sm">Como funciona</p>
                <p className="text-xs text-muted-foreground">5 questões rápidas por matéria. Quanto melhor for, maior será o intervalo até a próxima revisão.</p>
              </div>
            </CardContent>
          </Card>

          {revisoes.map((r, idx) => {
            const atraso = diasAtraso(r.proxima_revisao);
            return (
              <Card key={r.id} className="shadow-card border-border/50 hover:shadow-elevated transition-shadow">
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      atraso > 1 ? "bg-destructive/10" : "bg-primary/10"
                    }`}>
                      {atraso > 1
                        ? <span className="text-destructive font-bold text-sm">{atraso}d</span>
                        : <Calendar className="w-5 h-5 text-primary" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold font-display truncate">{r.materiaNome}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Última nota: <span className={r.ultima_nota >= 7 ? "text-success font-medium" : "text-destructive font-medium"}>{Number(r.ultima_nota).toFixed(1)}</span></span>
                        <span>·</span>
                        <span>{r.repeticoes} revisões feitas</span>
                        {atraso > 0 && <><span>·</span><span className="text-destructive">{atraso === 1 ? "ontem" : `${atraso} dias atrás`}</span></>}
                      </div>
                    </div>
                  </div>
                  <Button variant="hero" size="sm" onClick={() => iniciarRevisaoMateria(r, idx)} className="shrink-0">
                    Revisar
                  </Button>
                </CardContent>
              </Card>
            );
          })}

          <Button variant="hero" className="w-full mt-4" onClick={() => iniciarRevisaoMateria(revisoes[0], 0)}>
            <Zap className="w-4 h-4 mr-2" /> Revisar tudo agora ({revisoes.length} matérias)
          </Button>
        </main>
      </div>
    );
  }

  // Tela: gerando questões
  if (fase === "quiz" && gerandoQuestoes) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-lg font-bold font-display">Preparando revisão de {materiaAtual?.materiaNome}</h2>
        <p className="text-sm text-muted-foreground">Gerando 5 questões...</p>
        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
      </div>
    </div>
  );

  // Tela: quiz
  if (fase === "quiz" && questoes.length > 0) {
    const q = questoes[currentIdx];
    const progress = ((currentIdx + (answered ? 1 : 0)) / questoes.length) * 100;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="border-b border-border bg-card/50 px-4 py-3">
          <div className="container mx-auto max-w-2xl flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{materiaAtual?.materiaNome}</p>
              <p className="text-xs text-muted-foreground">Revisão · {currentIdx + 1}/{questoes.length}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Matéria {indiceMateria + 1} de {revisoes.length}</span>
            </div>
          </div>
          <div className="container mx-auto max-w-2xl mt-2">
            <Progress value={progress} className="h-2" />
          </div>
        </div>

        <main className="flex-1 container mx-auto max-w-2xl px-4 py-8 flex flex-col">
          <Card className="shadow-elevated border-border/50 flex-1 animate-fade-in" key={currentIdx}>
            <CardContent className="pt-8 pb-6 px-6 flex flex-col h-full">
              <h2 className="text-lg font-semibold font-display mb-6 leading-relaxed">{q.pergunta}</h2>
              <div className="space-y-3 flex-1">
                {q.alternativas.map((alt: string, i: number) => {
                  const letter = String.fromCharCode(65 + i);
                  const isSelected = selected === alt;
                  const isCorrect = answered && alt === q.resposta_correta;
                  const isWrong = answered && isSelected && alt !== q.resposta_correta;
                  let borderClass = "border-border hover:border-primary/50";
                  if (isSelected && !answered) borderClass = "border-primary bg-primary/5";
                  if (isCorrect) borderClass = "border-success bg-success/10";
                  if (isWrong) borderClass = "border-destructive bg-destructive/10";
                  return (
                    <button key={i} disabled={answered}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all flex items-center gap-3 ${borderClass}`}
                      onClick={() => !answered && setSelected(alt)}>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        isCorrect ? "bg-success text-white" : isWrong ? "bg-destructive text-white" : isSelected ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                      }`}>{isCorrect ? "✓" : isWrong ? "✗" : letter}</span>
                      <span className="text-sm">{alt}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end">
                {!answered
                  ? <Button variant="hero" onClick={handleConfirm} disabled={!selected}>Confirmar</Button>
                  : <Button variant="hero" onClick={handleNext}>
                    {currentIdx < questoes.length - 1 ? "Próxima →" : "Ver Resultado"}
                  </Button>}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Tela: resultado de uma matéria
  if (fase === "resultado_materia" && resultadoMateria) {
    const { nota, acertos, total } = resultadoMateria;
    const proximo = revisoesCompletas[revisoesCompletas.length - 1]?.proximo;
    const temMais = indiceMateria + 1 < revisoes.length;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full space-y-6 animate-fade-in text-center">
          <div className={`w-20 h-20 rounded-2xl mx-auto flex items-center justify-center text-4xl ${
            nota >= 7 ? "bg-success/10" : nota >= 5 ? "bg-warning/10" : "bg-destructive/10"
          }`}>
            {nota >= 7 ? "🎯" : nota >= 5 ? "📈" : "💪"}
          </div>
          <div>
            <p className="text-muted-foreground text-sm mb-1">{materiaAtual?.materiaNome}</p>
            <p className={`text-5xl font-bold font-display ${nota >= 7 ? "text-success" : nota >= 5 ? "text-warning" : "text-destructive"}`}>
              {nota.toFixed(1)}
            </p>
            <p className="text-muted-foreground mt-1">{acertos} de {total} acertos</p>
          </div>
          <Card className="border-border/50">
            <CardContent className="py-3 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              <span className="text-sm">Próxima revisão: <span className="font-semibold text-primary">{proximo}</span></span>
            </CardContent>
          </Card>
          {temMais ? (
            <Button variant="hero" className="w-full" onClick={proximaMateria}>
              Próxima matéria: {revisoes[indiceMateria + 1]?.materiaNome} →
            </Button>
          ) : (
            <Button variant="hero" className="w-full" onClick={() => setFase("completo")}>
              Ver resumo da sessão
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Tela: sessão completa
  if (fase === "completo") {
    const mediaGeral = revisoesCompletas.reduce((s, r) => s + r.nota, 0) / revisoesCompletas.length;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full space-y-6 animate-fade-in">
          <div className="text-center">
            <div className="text-5xl mb-3">🏆</div>
            <h2 className="text-2xl font-bold font-display">Sessão concluída!</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {revisoesCompletas.length} matéria{revisoesCompletas.length !== 1 ? "s" : ""} revisada{revisoesCompletas.length !== 1 ? "s" : ""}
              · média {mediaGeral.toFixed(1)}
            </p>
          </div>
          <div className="space-y-2">
            {revisoesCompletas.map((r, i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="py-3 flex items-center justify-between">
                  <span className="text-sm font-medium">{r.nome}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className={`font-bold ${r.nota >= 7 ? "text-success" : r.nota >= 5 ? "text-warning" : "text-destructive"}`}>
                      {r.nota.toFixed(1)}
                    </span>
                    <span>· {r.proximo}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button variant="hero" className="w-full" onClick={() => navigate("/dashboard")}>
            <CheckCircle className="w-4 h-4 mr-2" /> Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

export default RevisaoEspacadaPage;
