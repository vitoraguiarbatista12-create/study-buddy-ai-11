import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Clock, CheckCircle, XCircle, ArrowRight, Brain, Zap } from "lucide-react";

interface Questao {
  id: string;
  pergunta: string;
  alternativas: string[];
  resposta_correta: string;
}

const TEMPO_POR_QUESTAO = 30; // segundos

const QuizPage = () => {
  const { resultadoId } = useParams<{ resultadoId: string }>();
  const navigate = useNavigate();
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timerTotal, setTimerTotal] = useState(0);
  const [timerQuestao, setTimerQuestao] = useState(TEMPO_POR_QUESTAO);
  const [modoTemporizador, setModoTemporizador] = useState(false);
  const [finished, setFinished] = useState(false);
  const [iniciou, setIniciou] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!resultadoId) return;
    supabase.from("questoes").select("*").eq("resultado_id", resultadoId).then(({ data }) => {
      if (data && data.length > 0) {
        setQuestoes(data.map((q) => ({
          ...q,
          alternativas: Array.isArray(q.alternativas) ? q.alternativas as string[] : JSON.parse(q.alternativas as string),
        })));
      }
      setLoading(false);
    });
  }, [resultadoId]);

  // Timer total
  useEffect(() => {
    if (!iniciou || finished) return;
    const interval = setInterval(() => setTimerTotal((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [iniciou, finished]);

  // Timer por questão
  useEffect(() => {
    if (!modoTemporizador || !iniciou || answered || finished) return;
    setTimerQuestao(TEMPO_POR_QUESTAO);
    timerRef.current = setInterval(() => {
      setTimerQuestao((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          // Tempo esgotado — marca como errada
          setAnswered(true);
          const questao = questoes[currentIndex];
          if (questao) {
            setRespostas((prev) => ({ ...prev, [questao.id]: "__timeout__" }));
            toast.error("Tempo esgotado!");
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [currentIndex, modoTemporizador, iniciou, answered, finished]);

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const handleSelect = (alt: string) => {
    if (answered) return;
    setSelected(alt);
  };

  const handleConfirm = () => {
    if (!selected) { toast.error("Selecione uma alternativa"); return; }
    if (timerRef.current) clearInterval(timerRef.current);
    setAnswered(true);
    setRespostas((prev) => ({ ...prev, [questoes[currentIndex].id]: selected }));
  };

  const handleNext = () => {
    if (currentIndex < questoes.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelected(null);
      setAnswered(false);
    } else {
      finalizarQuiz();
    }
  };

  const finalizarQuiz = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setFinished(true);
    let acertos = 0, erros = 0;
    const allRespostas = { ...respostas };
    if (selected && !allRespostas[questoes[currentIndex]?.id]) {
      allRespostas[questoes[currentIndex].id] = selected;
    }
    questoes.forEach((q) => {
      if (allRespostas[q.id] === q.resposta_correta) acertos++;
      else erros++;
    });
    const nota = questoes.length > 0 ? (acertos / questoes.length) * 10 : 0;

    for (const q of questoes) {
      const resposta = allRespostas[q.id];
      await supabase.from("questoes").update({
        resposta_usuario: resposta === "__timeout__" ? null : resposta || null
      }).eq("id", q.id);
    }

    try {
      await supabase.functions.invoke("feedback-quiz", {
        body: {
          resultadoId,
          acertos,
          erros,
          nota,
          questoes: questoes.map((q) => ({
            pergunta: q.pergunta,
            respostaUsuario: allRespostas[q.id] === "__timeout__" ? "" : (allRespostas[q.id] || ""),
            respostaCorreta: q.resposta_correta,
          })),
        },
      });
    } catch (err) {
      console.error("Feedback error:", err);
    }
    navigate(`/resultado/${resultadoId}`);
  }, [respostas, questoes, currentIndex, selected, resultadoId, navigate]);

  // Tela de escolha do modo
  if (!loading && !iniciou) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4 animate-fade-in">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold font-display mb-1">Pronto para o quiz?</h2>
            <p className="text-muted-foreground text-sm">{questoes.length} questões · Escolha o modo</p>
          </div>
          <Card
            className="shadow-card border-border/50 cursor-pointer hover:shadow-elevated hover:border-primary/50 transition-all"
            onClick={() => { setModoTemporizador(false); setIniciou(true); }}
          >
            <CardContent className="pt-6 pb-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-bold font-display">Modo Normal</p>
                <p className="text-sm text-muted-foreground">Sem limite de tempo por questão</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className="shadow-card border-border/50 cursor-pointer hover:shadow-elevated hover:border-orange-500/50 transition-all"
            onClick={() => { setModoTemporizador(true); setIniciou(true); }}
          >
            <CardContent className="pt-6 pb-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="font-bold font-display text-orange-500">Modo Cronometrado</p>
                <p className="text-sm text-muted-foreground">{TEMPO_POR_QUESTAO}s por questão — simula prova real</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  if (questoes.length === 0) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Nenhuma questão encontrada</p>
    </div>
  );

  const questao = questoes[currentIndex];
  const progress = ((currentIndex + (answered ? 1 : 0)) / questoes.length) * 100;
  const timerPerc = (timerQuestao / TEMPO_POR_QUESTAO) * 100;
  const timerCor = timerQuestao <= 10 ? "text-destructive" : timerQuestao <= 20 ? "text-warning" : "text-muted-foreground";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm px-4 py-3">
        <div className="container mx-auto max-w-3xl flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Questão {currentIndex + 1} de {questoes.length}
            {modoTemporizador && <span className="ml-2 text-xs bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded-full">⚡ Cronometrado</span>}
          </span>
          <div className="flex items-center gap-3">
            {modoTemporizador && !answered && (
              <div className={`flex items-center gap-1 font-mono font-bold text-sm ${timerCor}`}>
                <Clock className="w-4 h-4" />
                {timerQuestao}s
              </div>
            )}
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-mono">{formatTime(timerTotal)}</span>
            </div>
          </div>
        </div>
        <div className="container mx-auto max-w-3xl mt-2 space-y-1">
          <Progress value={progress} className="h-2" />
          {modoTemporizador && !answered && (
            <Progress
              value={timerPerc}
              className="h-1"
              style={{ "--progress-color": timerQuestao <= 10 ? "hsl(var(--destructive))" : "hsl(var(--warning))" } as any}
            />
          )}
        </div>
      </div>

      {/* Question */}
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-8 flex flex-col">
        <Card className="shadow-elevated border-border/50 flex-1 animate-fade-in" key={currentIndex}>
          <CardContent className="pt-8 pb-6 px-6 flex flex-col h-full">
            <h2 className="text-lg font-semibold font-display mb-6 leading-relaxed">{questao.pergunta}</h2>

            <div className="space-y-3 flex-1">
              {questao.alternativas.map((alt, i) => {
                const letter = String.fromCharCode(65 + i);
                const isSelected = selected === alt;
                const isCorrect = answered && alt === questao.resposta_correta;
                const isWrong = answered && isSelected && alt !== questao.resposta_correta;

                let borderClass = "border-border hover:border-primary/50";
                if (isSelected && !answered) borderClass = "border-primary bg-primary/5";
                if (isCorrect) borderClass = "border-success bg-success/10";
                if (isWrong) borderClass = "border-destructive bg-destructive/10";

                return (
                  <button
                    key={i}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all flex items-center gap-3 ${borderClass}`}
                    onClick={() => handleSelect(alt)}
                    disabled={answered}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      isCorrect ? "bg-success text-success-foreground" :
                      isWrong ? "bg-destructive text-destructive-foreground" :
                      isSelected ? "bg-primary text-primary-foreground" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {isCorrect ? <CheckCircle className="w-4 h-4" /> : isWrong ? <XCircle className="w-4 h-4" /> : letter}
                    </span>
                    <span className="text-sm">{alt}</span>
                  </button>
                );
              })}
            </div>

            {/* Timeout feedback */}
            {answered && respostas[questao.id] === "__timeout__" && (
              <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive font-medium">
                ⏰ Tempo esgotado! A resposta correta era: <span className="font-bold">{questao.resposta_correta}</span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              {!answered ? (
                <Button variant="hero" onClick={handleConfirm} disabled={!selected}>Confirmar</Button>
              ) : (
                <Button variant="hero" onClick={handleNext}>
                  {currentIndex < questoes.length - 1 ? (<>Próxima <ArrowRight className="w-4 h-4 ml-1" /></>) : "Ver Resultado"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default QuizPage;
