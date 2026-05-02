import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft, Map, Loader2, RefreshCw, Calendar, Target, TrendingUp
} from "lucide-react";

const PlanPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [plano, setPlano] = useState<string | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const [resultadosRes, materiasRes, planoRes] = await Promise.all([
      supabase.from("resultados").select("*, materias(nome)").order("created_at", { ascending: false }),
      supabase.from("materias").select("*"),
      supabase.from("planos_estudo").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(1).single(),
    ]);

    const resultados = resultadosRes.data || [];
    const materias = materiasRes.data || [];

    // Build stats per materia
    const statsMap: Record<string, { nome: string; notas: number[]; media: number }> = {};
    for (const r of resultados) {
      const nome = (r.materias as any)?.nome || "Desconhecida";
      if (!statsMap[r.materia_id]) statsMap[r.materia_id] = { nome, notas: [], media: 0 };
      statsMap[r.materia_id].notas.push(Number(r.nota_estimada));
    }
    for (const key of Object.keys(statsMap)) {
      const ns = statsMap[key].notas;
      statsMap[key].media = ns.reduce((a, b) => a + b, 0) / ns.length;
    }

    setStats({ statsMap, totalQuizzes: resultados.length, totalMaterias: materias.length });

    if (planoRes.data) {
      setPlano(planoRes.data.conteudo);
      setGeradoEm(planoRes.data.created_at);
    }

    setLoading(false);
  };

  const gerarPlano = async () => {
    if (!stats || stats.totalQuizzes < 2) {
      toast.error("Faça pelo menos 2 quizzes para gerar um plano personalizado!");
      return;
    }

    setGenerating(true);

    const resumoDesempenho = Object.values(stats.statsMap as Record<string, any>)
      .map((m: any) => `- ${m.nome}: média ${m.media.toFixed(1)} (${m.notas.length} quiz${m.notas.length !== 1 ? "zes" : ""})`)
      .join("\n");

    // Passa IDs e médias para a edge function buscar os PDFs
    const materias = Object.entries(stats.statsMap as Record<string, any>).map(([id, m]: [string, any]) => ({
      id,
      nome: m.nome,
      media: m.media,
      quizzes: m.notas.length,
    }));

    try {
      const { data, error } = await supabase.functions.invoke("gerar-plano-estudos", {
        body: { resumoDesempenho, totalQuizzes: stats.totalQuizzes, materias },
      });
      if (error) throw error;

      const conteudo = data?.plano || "Não foi possível gerar o plano.";
      setPlano(conteudo);

      await supabase.from("planos_estudo").upsert({
        user_id: user!.id,
        conteudo,
      });

      setGeradoEm(new Date().toISOString());
      toast.success("Plano de estudos gerado!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar plano");
    }
    setGenerating(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  const materiasOrdenadas = stats
    ? Object.values(stats.statsMap as Record<string, any>).sort((a: any, b: any) => a.media - b.media)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold font-display">Plano de Estudos</h1>
            <p className="text-xs text-muted-foreground">Personalizado pela IA com base no seu desempenho</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">

        {/* Snapshot de desempenho */}
        {materiasOrdenadas.length > 0 && (
          <Card className="shadow-card border-border/50 animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="font-display flex items-center gap-2 text-base">
                <Target className="w-4 h-4 text-primary" />
                Seu Desempenho Atual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {materiasOrdenadas.map((m: any) => {
                const cor = m.media >= 8 ? "bg-success" : m.media >= 5 ? "bg-warning" : "bg-destructive";
                const pct = (m.media / 10) * 100;
                return (
                  <div key={m.nome}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{m.nome}</span>
                      <span className={`font-bold ${m.media >= 8 ? "text-success" : m.media >= 5 ? "text-warning" : "text-destructive"}`}>
                        {m.media.toFixed(1)}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className={`${cor} rounded-full h-2 transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Gerar plano */}
        {stats?.totalQuizzes < 2 ? (
          <Card className="shadow-card border-border/50 border-dashed animate-fade-in">
            <CardContent className="py-10 text-center">
              <TrendingUp className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium text-muted-foreground mb-1">Dados insuficientes</p>
              <p className="text-sm text-muted-foreground">Complete pelo menos 2 quizzes para receber um plano de estudos personalizado.</p>
              <Button variant="hero" className="mt-4" onClick={() => navigate("/dashboard")}>Ir estudar agora</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="flex justify-between items-center">
            {geradoEm && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Gerado em {new Date(geradoEm).toLocaleDateString("pt-BR")}
              </p>
            )}
            <Button
              variant={plano ? "outline" : "hero"}
              size="sm"
              onClick={gerarPlano}
              disabled={generating}
              className="ml-auto"
            >
              {generating
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>
                : plano
                ? <><RefreshCw className="w-4 h-4 mr-2" />Atualizar plano</>
                : <><Map className="w-4 h-4 mr-2" />Gerar plano de estudos</>}
            </Button>
          </div>
        )}

        {/* Plano gerado */}
        {generating && (
          <Card className="shadow-card border-border/50 animate-fade-in">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">A IA está analisando seu desempenho e montando seu plano...</p>
            </CardContent>
          </Card>
        )}

        {plano && !generating && (
          <Card className="shadow-card border-border/50 animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="font-display flex items-center gap-2 text-base">
                <Map className="w-4 h-4 text-accent" />
                Seu Plano Personalizado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none text-foreground">
                <ReactMarkdown>{plano}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default PlanPage;
