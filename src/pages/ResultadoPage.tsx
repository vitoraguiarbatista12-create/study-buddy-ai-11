import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Trophy, ArrowLeft, TrendingUp, AlertTriangle, CheckCircle, Loader2
} from "lucide-react";

const ResultadoPage = () => {
  const { resultadoId } = useParams<{ resultadoId: string }>();
  const navigate = useNavigate();
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!resultadoId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("resultados")
        .select("*, materias(nome)")
        .eq("id", resultadoId)
        .single();
      setResultado(data);
      setLoading(false);

      // Poll for feedback if not yet available
      if (data && !data.feedback) {
        const interval = setInterval(async () => {
          const { data: updated } = await supabase
            .from("resultados")
            .select("feedback")
            .eq("id", resultadoId)
            .single();
          if (updated?.feedback) {
            setResultado((prev: any) => ({ ...prev, feedback: updated.feedback }));
            clearInterval(interval);
          }
        }, 2000);
        setTimeout(() => clearInterval(interval), 30000);
      }
    };
    fetch();
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

  const nota = Number(resultado.nota_estimada);
  const total = resultado.acertos + resultado.erros;
  const porcentagem = total > 0 ? (resultado.acertos / total) * 100 : 0;

  const classificacao = nota >= 8 ? {
    label: "Avançado", color: "text-success", icon: Trophy, bg: "bg-success/10"
  } : nota >= 5 ? {
    label: "Médio", color: "text-warning", icon: TrendingUp, bg: "bg-warning/10"
  } : {
    label: "Fraco", color: "text-destructive", icon: AlertTriangle, bg: "bg-destructive/10"
  };

  const Icon = classificacao.icon;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm px-4 py-3">
        <div className="container mx-auto max-w-3xl flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold font-display">Resultado</h1>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Score Card */}
        <Card className="shadow-elevated border-border/50 animate-fade-in overflow-hidden">
          <div className="gradient-hero p-8 text-center">
            <div className={`inline-flex w-20 h-20 rounded-full items-center justify-center mb-4 bg-background/20`}>
              <Icon className="w-10 h-10 text-primary-foreground" />
            </div>
            <p className="text-5xl font-bold font-display text-primary-foreground mb-2">
              {nota.toFixed(1)}
            </p>
            <p className="text-lg font-medium text-primary-foreground/80">
              {classificacao.label}
            </p>
          </div>
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold font-display text-success">{resultado.acertos}</p>
                <p className="text-sm text-muted-foreground">Acertos</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-display text-destructive">{resultado.erros}</p>
                <p className="text-sm text-muted-foreground">Erros</p>
              </div>
              <div>
                <p className="text-2xl font-bold font-display">{porcentagem.toFixed(0)}%</p>
                <p className="text-sm text-muted-foreground">Aproveitamento</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Feedback */}
        <Card className="shadow-card border-border/50 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-accent" />
              Feedback da IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resultado.feedback ? (
              <div className="prose prose-sm max-w-none text-foreground">
                {resultado.feedback.split("\n").map((line: string, i: number) => (
                  <p key={i} className={line.trim() === "" ? "mb-2" : "mb-1"}>
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gerando feedback com IA...</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate("/dashboard")}>
            Voltar ao Dashboard
          </Button>
          {resultado.materias && (
            <Button
              variant="hero"
              className="flex-1"
              onClick={() => navigate(`/materia/${resultado.materia_id}`)}
            >
              Estudar Mais
            </Button>
          )}
        </div>
      </main>
    </div>
  );
};

export default ResultadoPage;
