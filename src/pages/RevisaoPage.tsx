import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";

interface Questao {
  id: string;
  pergunta: string;
  alternativas: string[];
  resposta_correta: string;
  resposta_usuario: string | null;
}

interface Resultado {
  id: string;
  acertos: number;
  erros: number;
  nota_estimada: number;
  materias: { nome: string } | null;
}

const RevisaoPage = () => {
  const { resultadoId } = useParams<{ resultadoId: string }>();
  const navigate = useNavigate();
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!resultadoId) return;
    Promise.all([
      supabase
        .from("questoes")
        .select("*")
        .eq("resultado_id", resultadoId),
      supabase
        .from("resultados")
        .select("*, materias(nome)")
        .eq("id", resultadoId)
        .single(),
    ]).then(([questoesRes, resultadoRes]) => {
      if (questoesRes.data) {
        setQuestoes(
          questoesRes.data.map((q) => ({
            ...q,
            alternativas: Array.isArray(q.alternativas)
              ? (q.alternativas as string[])
              : JSON.parse(q.alternativas as string),
          }))
        );
      }
      if (resultadoRes.data) setResultado(resultadoRes.data as any);
      setLoading(false);
    });
  }, [resultadoId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!resultado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Resultado não encontrado</p>
      </div>
    );
  }

  const total = resultado.acertos + resultado.erros;
  const porcentagem = total > 0 ? (resultado.acertos / total) * 100 : 0;
  const materiaNome = (resultado.materias as any)?.nome || "Matéria";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm px-4 py-3">
        <div className="container mx-auto max-w-3xl flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold font-display">
            Revisão do Quiz — {materiaNome}
          </h1>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
        {/* Summary bar */}
        <Card className="shadow-card border-border/50">
          <CardContent className="py-4">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xl font-bold font-display">{Number(resultado.nota_estimada).toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Nota</p>
              </div>
              <div>
                <p className="text-xl font-bold font-display text-success">{resultado.acertos}</p>
                <p className="text-xs text-muted-foreground">Acertos</p>
              </div>
              <div>
                <p className="text-xl font-bold font-display text-destructive">{resultado.erros}</p>
                <p className="text-xs text-muted-foreground">Erros</p>
              </div>
              <div>
                <p className="text-xl font-bold font-display">{porcentagem.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">Aproveitamento</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        {questoes.map((q, idx) => {
          const userAnswer = q.resposta_usuario;
          const isCorrectAnswer = userAnswer === q.resposta_correta;

          return (
            <Card key={q.id} className="shadow-card border-border/50 animate-fade-in" style={{ animationDelay: `${idx * 0.05}s` }}>
              <CardContent className="pt-6 pb-5 px-6">
                <p className="text-sm text-muted-foreground mb-1">Questão {idx + 1}</p>
                <h3 className="text-base font-semibold font-display mb-4 leading-relaxed">
                  {q.pergunta}
                </h3>

                <div className="space-y-2">
                  {q.alternativas.map((alt, i) => {
                    const letter = String.fromCharCode(65 + i);
                    const isCorrect = alt === q.resposta_correta;
                    const isUserPick = alt === userAnswer;

                    let classes = "border-border/50 text-muted-foreground";
                    if (isCorrect && isUserPick) {
                      classes = "border-success bg-success/10 text-foreground";
                    } else if (isCorrect) {
                      classes = "border-success/60 bg-success/5 text-foreground";
                    } else if (isUserPick) {
                      classes = "border-destructive bg-destructive/10 text-foreground";
                    }

                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${classes}`}
                      >
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isCorrect ? "bg-success text-success-foreground" :
                          isUserPick ? "bg-destructive text-destructive-foreground" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {isCorrect ? <CheckCircle className="w-3.5 h-3.5" /> :
                           isUserPick ? <XCircle className="w-3.5 h-3.5" /> :
                           letter}
                        </span>
                        <span className="text-sm">{alt}</span>
                        {isCorrect && isUserPick && (
                          <span className="ml-auto text-xs font-medium text-success">Sua resposta ✓</span>
                        )}
                        {isCorrect && !isUserPick && (
                          <span className="ml-auto text-xs font-medium text-success">Resposta correta</span>
                        )}
                        {!isCorrect && isUserPick && (
                          <span className="ml-auto text-xs font-medium text-destructive">Sua resposta</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao Dashboard
        </Button>
      </main>
    </div>
  );
};

export default RevisaoPage;
