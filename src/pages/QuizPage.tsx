import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Clock, CheckCircle, XCircle, ArrowRight } from "lucide-react";

interface Questao {
  id: string;
  pergunta: string;
  alternativas: string[];
  resposta_correta: string;
}

const QuizPage = () => {
  const { resultadoId } = useParams<{ resultadoId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timer, setTimer] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!resultadoId) return;
    supabase
      .from("questoes")
      .select("*")
      .eq("resultado_id", resultadoId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const parsed = data.map((q) => ({
            ...q,
            alternativas: Array.isArray(q.alternativas)
              ? q.alternativas as string[]
              : JSON.parse(q.alternativas as string) as string[],
          }));
          setQuestoes(parsed);
        }
        setLoading(false);
      });
  }, [resultadoId]);

  // Timer
  useEffect(() => {
    if (loading || finished) return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [loading, finished]);

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
    if (!selected) {
      toast.error("Selecione uma alternativa");
      return;
    }
    setAnswered(true);
    setRespostas((prev) => ({
      ...prev,
      [questoes[currentIndex].id]: selected,
    }));
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
    setFinished(true);
    let acertos = 0;
    let erros = 0;
    const allRespostas = { ...respostas };
    if (selected && !allRespostas[questoes[currentIndex]?.id]) {
      allRespostas[questoes[currentIndex].id] = selected;
    }

    questoes.forEach((q) => {
      if (allRespostas[q.id] === q.resposta_correta) acertos++;
      else erros++;
    });

    const nota = questoes.length > 0 ? (acertos / questoes.length) * 10 : 0;

    // Save user responses per question
    for (const q of questoes) {
      await supabase
        .from("questoes")
        .update({ resposta_usuario: allRespostas[q.id] || null })
        .eq("id", q.id);
    }

    // Send data to edge function which handles both the update and AI feedback
    try {
      await supabase.functions.invoke("feedback-quiz", {
        body: {
          resultadoId,
          acertos,
          erros,
          nota,
          questoes: questoes.map((q) => ({
            pergunta: q.pergunta,
            respostaUsuario: allRespostas[q.id] || "",
            respostaCorreta: q.resposta_correta,
          })),
        },
      });
    } catch (err) {
      console.error("Feedback error:", err);
    }

    navigate(`/resultado/${resultadoId}`);
  }, [respostas, questoes, currentIndex, selected, resultadoId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (questoes.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Nenhuma questão encontrada</p>
      </div>
    );
  }

  const questao = questoes[currentIndex];
  const progress = ((currentIndex + (answered ? 1 : 0)) / questoes.length) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm px-4 py-3">
        <div className="container mx-auto max-w-3xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Questão {currentIndex + 1} de {questoes.length}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-mono">{formatTime(timer)}</span>
          </div>
        </div>
        <div className="container mx-auto max-w-3xl mt-2">
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Question */}
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-8 flex flex-col">
        <Card className="shadow-elevated border-border/50 flex-1 animate-fade-in" key={currentIndex}>
          <CardContent className="pt-8 pb-6 px-6 flex flex-col h-full">
            <h2 className="text-lg font-semibold font-display mb-6 leading-relaxed">
              {questao.pergunta}
            </h2>

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
                      {isCorrect ? <CheckCircle className="w-4 h-4" /> :
                       isWrong ? <XCircle className="w-4 h-4" /> :
                       letter}
                    </span>
                    <span className="text-sm">{alt}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              {!answered ? (
                <Button variant="hero" onClick={handleConfirm} disabled={!selected}>
                  Confirmar
                </Button>
              ) : (
                <Button variant="hero" onClick={handleNext}>
                  {currentIndex < questoes.length - 1 ? (
                    <>Próxima <ArrowRight className="w-4 h-4 ml-1" /></>
                  ) : (
                    "Ver Resultado"
                  )}
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
