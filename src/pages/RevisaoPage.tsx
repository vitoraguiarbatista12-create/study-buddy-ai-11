import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, XCircle, Brain, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface Questao {
  id: string; pergunta: string; alternativas: string[];
  resposta_correta: string; resposta_usuario: string | null;
}
interface Resultado {
  id: string; acertos: number; erros: number; nota_estimada: number;
  materias: { nome: string } | null;
}

const RevisaoPage = () => {
  const { resultadoId } = useParams<{ resultadoId: string }>();
  const navigate = useNavigate();
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [loading, setLoading] = useState(true);
  const [explicacoes, setExplicacoes] = useState<Record<string, string>>({});
  const [loadingExp, setLoadingExp] = useState<Record<string, boolean>>({});
  const [expandedExp, setExpandedExp] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!resultadoId) return;
    Promise.all([
      supabase.from("questoes").select("*").eq("resultado_id", resultadoId),
      supabase.from("resultados").select("*, materias(nome)").eq("id", resultadoId).single(),
    ]).then(([qRes, rRes]) => {
      if (qRes.data) setQuestoes(qRes.data.map((q) => ({
        ...q,
        alternativas: Array.isArray(q.alternativas) ? q.alternativas as string[] : JSON.parse(q.alternativas as string),
      })));
      if (rRes.data) setResultado(rRes.data as any);
      setLoading(false);
    });
  }, [resultadoId]);

  const explicarErro = async (q: Questao) => {
    if (explicacoes[q.id]) {
      setExpandedExp(prev => ({ ...prev, [q.id]: !prev[q.id] }));
      return;
    }
    setLoadingExp(prev => ({ ...prev, [q.id]: true }));
    setExpandedExp(prev => ({ ...prev, [q.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("explicar-erro", {
        body: {
          pergunta: q.pergunta, alternativas: q.alternativas,
          respostaUsuario: q.resposta_usuario, respostaCorreta: q.resposta_correta,
        },
      });
      if (error) throw error;
      setExplicacoes(prev => ({ ...prev, [q.id]: data?.explicacao || "Não foi possível gerar." }));
    } catch (err) {
      toast.error("Erro ao buscar explicação");
      setExpandedExp(prev => ({ ...prev, [q.id]: false }));
    }
    setLoadingExp(prev => ({ ...prev, [q.id]: false }));
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!resultado) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Resultado não encontrado</p>
    </div>
  );

  const total = resultado.acertos + resultado.erros;
  const porcentagem = total > 0 ? (resultado.acertos / total) * 100 : 0;
  const materiaNome = (resultado.materias as any)?.nome || "Matéria";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm px-4 py-3">
        <div className="container mx-auto max-w-3xl flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-xl font-bold font-display">Revisão — {materiaNome}</h1>
        </div>
      </header>
      <main className="container mx-auto max-w-3xl px-4 py-6 space-y-5">
        <Card className="shadow-card border-border/50">
          <CardContent className="py-4">
            <div className="grid grid-cols-4 gap-4 text-center">
              {[
                { value: Number(resultado.nota_estimada).toFixed(1), label: "Nota", color: "" },
                { value: resultado.acertos, label: "Acertos", color: "text-success" },
                { value: resultado.erros, label: "Erros", color: "text-destructive" },
                { value: `${porcentagem.toFixed(0)}%`, label: "Aproveitamento", color: "" },
              ].map(({ value, label, color }) => (
                <div key={label}>
                  <p className={`text-xl font-bold font-display ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {questoes.map((q, idx) => {
          const isCorrect = q.resposta_usuario === q.resposta_correta;
          const hasExp = !!explicacoes[q.id];
          const isExpanded = expandedExp[q.id];
          return (
            <Card key={q.id} className={`shadow-card animate-fade-in ${!isCorrect ? "border-l-4 border-l-destructive/50" : "border-l-4 border-l-success/50"}`}
              style={{ animationDelay: `${idx * 0.04}s` }}>
              <CardContent className="pt-5 pb-5 px-5">
                <div className="flex items-center gap-2 mb-3">
                  {isCorrect ? <CheckCircle className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-destructive" />}
                  <p className="text-xs text-muted-foreground">Questão {idx + 1}</p>
                </div>
                <h3 className="text-sm font-semibold font-display mb-4 leading-relaxed">{q.pergunta}</h3>
                <div className="space-y-2">
                  {q.alternativas.map((alt, i) => {
                    const letter = String.fromCharCode(65 + i);
                    const isCorr = alt === q.resposta_correta;
                    const isUser = alt === q.resposta_usuario;
                    let bg = "bg-muted/30 border-border/50 text-muted-foreground";
                    if (isCorr && isUser) bg = "bg-success/10 border-success text-foreground";
                    else if (isCorr) bg = "bg-success/5 border-success/40 text-foreground";
                    else if (isUser) bg = "bg-destructive/10 border-destructive text-foreground";
                    return (
                      <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${bg}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isCorr ? "bg-success text-white" : isUser ? "bg-destructive text-white" : "bg-muted text-muted-foreground"
                        }`}>{isCorr ? "✓" : isUser ? "✗" : letter}</span>
                        <span className="text-sm flex-1">{alt}</span>
                        {isCorr && !isUser && <span className="text-xs text-success font-medium">Correta</span>}
                        {isCorr && isUser && <span className="text-xs text-success font-medium">Sua ✓</span>}
                        {!isCorr && isUser && <span className="text-xs text-destructive font-medium">Sua</span>}
                      </div>
                    );
                  })}
                </div>

                {!isCorrect && (
                  <div className="mt-4">
                    <Button variant="ghost" size="sm"
                      className="w-full text-accent hover:bg-accent/10 border border-accent/20"
                      onClick={() => explicarErro(q)} disabled={loadingExp[q.id]}>
                      {loadingExp[q.id]
                        ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Consultando IA...</>
                        : hasExp && isExpanded
                        ? <><ChevronUp className="w-3.5 h-3.5 mr-2" />Ocultar explicação</>
                        : <><Brain className="w-3.5 h-3.5 mr-2" />{hasExp ? "Ver explicação" : "Por que errei? Explicar com IA"}</>}
                    </Button>
                    {isExpanded && hasExp && (
                      <div className="mt-3 p-3 rounded-lg bg-accent/5 border border-accent/15 animate-fade-in">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain className="w-4 h-4 text-accent" />
                          <span className="text-xs font-semibold text-accent">Explicação da IA</span>
                        </div>
                        <div className="prose prose-sm max-w-none text-foreground">
                          <ReactMarkdown>{explicacoes[q.id]}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
