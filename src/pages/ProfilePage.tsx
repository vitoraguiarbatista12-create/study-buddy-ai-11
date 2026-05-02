import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, Trophy, Flame, Star, Target, BookOpen, Zap, Lock
} from "lucide-react";
import {
  calcularXP, getNivel, getProgressoNivel, CONQUISTAS, NIVEIS,
  type GamStats,
} from "@/lib/gamification";

const ProfilePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ nome: string } | null>(null);
  const [stats, setStats] = useState<GamStats | null>(null);
  const [xp, setXp] = useState(0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [profileRes, resultadosRes, materiasRes] = await Promise.all([
        supabase.from("profiles").select("nome").eq("user_id", user.id).single(),
        supabase.from("resultados").select("*").order("created_at", { ascending: true }),
        supabase.from("materias").select("id"),
      ]);

      const resultados = resultadosRes.data || [];
      const hoje = new Date().toDateString();

      // Streak
      const dias = [...new Set(resultados.map((r: any) => new Date(r.created_at).toDateString()))]
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      let streak = 0;
      let ref = new Date(); ref.setHours(0, 0, 0, 0);
      for (const dia of dias) {
        const d = new Date(dia);
        const diff = Math.round((ref.getTime() - d.getTime()) / 86400000);
        if (diff === 0 || diff === streak) { streak++; ref = new Date(d); ref.setDate(ref.getDate() - 1); }
        else break;
      }

      const s: GamStats = {
        totalQuizzes: resultados.length,
        totalAcertos: resultados.reduce((acc: number, r: any) => acc + r.acertos, 0),
        totalErros: resultados.reduce((acc: number, r: any) => acc + r.erros, 0),
        melhorNota: resultados.length > 0 ? Math.max(...resultados.map((r: any) => Number(r.nota_estimada))) : 0,
        streak,
        totalMaterias: materiasRes.data?.length || 0,
        notasAcima8: resultados.filter((r: any) => Number(r.nota_estimada) >= 8).length,
        notasAbaixo5: resultados.filter((r: any) => Number(r.nota_estimada) < 5).length,
        quizzesHoje: resultados.filter((r: any) => new Date(r.created_at).toDateString() === hoje).length,
      };

      setStats(s);
      setXp(calcularXP(s));
      if (profileRes.data) setProfile(profileRes.data);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  const nivel = getNivel(xp);
  const progresso = getProgressoNivel(xp);
  const conquistasDesbloqueadas = stats ? CONQUISTAS.filter(c => c.verificar(stats)) : [];
  const conquistasBloqueadas = stats ? CONQUISTAS.filter(c => !c.verificar(stats)) : [];
  const taxaAcerto = stats && (stats.totalAcertos + stats.totalErros) > 0
    ? ((stats.totalAcertos / (stats.totalAcertos + stats.totalErros)) * 100).toFixed(0)
    : "0";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold font-display">Meu Perfil</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">

        {/* Card de nível */}
        <Card className="shadow-elevated border-border/50 overflow-hidden animate-fade-in">
          <div className="gradient-hero p-8">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl bg-background/20 flex items-center justify-center text-4xl shrink-0">
                {nivel.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-primary-foreground/70 text-sm font-medium">Nível {nivel.nivel}</p>
                <h2 className="text-2xl font-bold font-display text-primary-foreground">{nivel.nome}</h2>
                <p className="text-primary-foreground/80 text-sm mt-0.5">{profile?.nome || user?.email}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-bold font-display text-primary-foreground">{xp}</p>
                <p className="text-primary-foreground/70 text-xs">XP total</p>
              </div>
            </div>
            <div className="mt-5 space-y-1">
              <div className="flex justify-between text-xs text-primary-foreground/70">
                <span>{xp - nivel.xpMin} XP neste nível</span>
                <span>{nivel.xpMax - nivel.xpMin} XP para subir</span>
              </div>
              <div className="w-full bg-background/20 rounded-full h-2.5">
                <div
                  className="bg-white rounded-full h-2.5 transition-all duration-700"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Stats rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
          {[
            { icon: Target, label: "Quizzes", value: stats?.totalQuizzes || 0, color: "text-primary", bg: "bg-primary/10" },
            { icon: Star, label: "Taxa de acerto", value: `${taxaAcerto}%`, color: "text-yellow-500", bg: "bg-yellow-500/10" },
            { icon: Flame, label: "Streak atual", value: `${stats?.streak || 0}d`, color: "text-orange-500", bg: "bg-orange-500/10" },
            { icon: Trophy, label: "Conquistas", value: `${conquistasDesbloqueadas.length}/${CONQUISTAS.length}`, color: "text-accent", bg: "bg-accent/10" },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <Card key={label} className="shadow-card border-border/50">
              <CardContent className="pt-4 pb-3">
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className="text-xl font-bold font-display">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Conquistas desbloqueadas */}
        {conquistasDesbloqueadas.length > 0 && (
          <Card className="shadow-card border-border/50 animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="font-display flex items-center gap-2 text-base">
                <Trophy className="w-4 h-4 text-yellow-500" />
                Conquistas ({conquistasDesbloqueadas.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {conquistasDesbloqueadas.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                    <span className="text-2xl shrink-0">{c.emoji}</span>
                    <div className="min-w-0">
                      <p className={`font-semibold text-sm ${c.cor}`}>{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Conquistas bloqueadas */}
        {conquistasBloqueadas.length > 0 && (
          <Card className="shadow-card border-border/50 animate-fade-in">
            <CardHeader className="pb-3">
              <CardTitle className="font-display flex items-center gap-2 text-base">
                <Lock className="w-4 h-4 text-muted-foreground" />
                Ainda não desbloqueadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {conquistasBloqueadas.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-dashed border-border/50 opacity-60">
                    <span className="text-2xl shrink-0 grayscale">{c.emoji}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-muted-foreground">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Roadmap de níveis */}
        <Card className="shadow-card border-border/50 animate-fade-in">
          <CardHeader className="pb-3">
            <CardTitle className="font-display flex items-center gap-2 text-base">
              <Zap className="w-4 h-4 text-primary" />
              Jornada de Níveis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {NIVEIS.map((n) => {
                const atingido = xp >= n.xpMin;
                const atual = nivel.nivel === n.nivel;
                return (
                  <div key={n.nivel} className={`flex items-center gap-3 p-3 rounded-lg transition-all ${atual ? "bg-primary/10 border border-primary/30" : atingido ? "bg-muted/50" : "opacity-40"}`}>
                    <span className="text-xl shrink-0">{n.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${atual ? "text-primary" : ""}`}>
                        Nível {n.nivel} — {n.nome}
                        {atual && <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Você está aqui</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{n.xpMin} XP{n.nivel < 8 ? ` → ${n.xpMax} XP` : "+"}</p>
                    </div>
                    {atingido && <span className="text-success text-sm">✓</span>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ProfilePage;
