import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BookOpen, Plus, LogOut, FileText, Target, Brain, TrendingUp,
  Trash2, MoreVertical, Eye, Flame, Star, Calendar
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

interface Materia { id: string; nome: string; created_at: string; }
interface Resultado { id: string; acertos: number; erros: number; nota_estimada: number; materia_id: string; created_at: string; }

const calcularStreak = (resultados: Resultado[]): number => {
  if (resultados.length === 0) return 0;
  const dias = [...new Set(resultados.map(r => new Date(r.created_at).toDateString()))]
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  let streak = 0;
  let ref = new Date(); ref.setHours(0, 0, 0, 0);
  for (const dia of dias) {
    const d = new Date(dia);
    const diff = Math.round((ref.getTime() - d.getTime()) / 86400000);
    if (diff === 0 || diff === streak) { streak++; ref = new Date(d); ref.setDate(ref.getDate() - 1); }
    else break;
  }
  return streak;
};

const DashboardPage = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [novaMateria, setNovaMateria] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ nome: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [materiasRes, resultadosRes, profileRes] = await Promise.all([
      supabase.from("materias").select("*").order("created_at", { ascending: false }),
      supabase.from("resultados").select("*").order("created_at", { ascending: true }),
      supabase.from("profiles").select("nome").eq("user_id", user!.id).single(),
    ]);
    if (materiasRes.data) setMaterias(materiasRes.data);
    if (resultadosRes.data) setResultados(resultadosRes.data);
    if (profileRes.data) setProfile(profileRes.data);
    setLoading(false);
  };

  const criarMateria = async () => {
    if (!novaMateria.trim()) { toast.error("Digite o nome da matéria"); return; }
    const { error } = await supabase.from("materias").insert({ nome: novaMateria.trim(), user_id: user!.id });
    if (error) toast.error("Erro ao criar matéria");
    else { toast.success("Matéria criada!"); setNovaMateria(""); setDialogOpen(false); fetchData(); }
  };

  const deletarMateria = async (id: string) => {
    await supabase.from("materias").delete().eq("id", id);
    fetchData();
  };

  const deletarResultado = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("resultados").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao apagar resultado");
    else { setResultados(prev => prev.filter(r => r.id !== deleteId)); toast.success("Resultado apagado"); }
    setDeleteId(null);
  };

  const streak = calcularStreak(resultados);
  const resultadosRecentes = [...resultados].reverse().slice(0, 5);
  const mediaGeral = resultados.length > 0
    ? (resultados.reduce((s, r) => s + Number(r.nota_estimada), 0) / resultados.length).toFixed(1) : "—";
  const melhorNota = resultados.length > 0
    ? Math.max(...resultados.map(r => Number(r.nota_estimada))).toFixed(1) : "—";

  const dadosGrafico = [...resultados].slice(-10).map((r, i) => ({
    i: i + 1,
    nota: Number(r.nota_estimada),
    data: new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  }));

  const cls = (nota: number) =>
    nota >= 8 ? { label: "Avançado", color: "text-success" } :
    nota >= 5 ? { label: "Médio", color: "text-warning" } :
    { label: "Fraco", color: "text-destructive" };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold font-display gradient-text">StudyAI</span>
          </div>
          <div className="flex items-center gap-4">
            {streak > 0 && (
              <div className="flex items-center gap-1 text-orange-500 font-semibold text-sm">
                <Flame className="w-4 h-4" />
                <span>{streak} {streak === 1 ? "dia" : "dias"}</span>
              </div>
            )}
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Olá, {profile?.nome || user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate("/login"); }}>
              <LogOut className="w-4 h-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl space-y-8">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-in">
          {[
            { icon: FileText, color: "text-primary", bg: "bg-primary/10", value: materias.length, label: "Matérias" },
            { icon: Target, color: "text-secondary", bg: "bg-secondary/10", value: resultados.length, label: "Quizzes" },
            { icon: TrendingUp, color: "text-accent", bg: "bg-accent/10", value: mediaGeral, label: "Média geral" },
            { icon: Star, color: "text-yellow-500", bg: "bg-yellow-500/10", value: melhorNota, label: "Melhor nota" },
          ].map(({ icon: Icon, color, bg, value, label }) => (
            <Card key={label} className="shadow-card border-border/50">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Streak banner */}
        {streak >= 2 && (
          <Card className="border-orange-500/30 bg-orange-500/5 shadow-card animate-fade-in">
            <CardContent className="py-4 flex items-center gap-4">
              <span className="text-3xl">🔥</span>
              <div>
                <p className="font-bold font-display text-orange-500">{streak} dias seguidos estudando!</p>
                <p className="text-sm text-muted-foreground">
                  {streak >= 7 ? "Você é imparável! Continue assim." :
                   streak >= 3 ? "Ótima sequência! Não perca o ritmo." :
                   "Bom começo! Volte amanhã para manter o streak."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Gráfico de evolução */}
        {dadosGrafico.length >= 2 && (
          <Card className="shadow-card border-border/50 animate-fade-in">
            <CardHeader className="pb-2">
              <CardTitle className="font-display flex items-center gap-2 text-base">
                <TrendingUp className="w-4 h-4 text-primary" />
                Evolução das Notas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={dadosGrafico} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}
                    formatter={(v: any) => [Number(v).toFixed(1), "Nota"]}
                    labelFormatter={(l) => `Data: ${l}`}
                  />
                  <Line type="monotone" dataKey="nota" stroke="hsl(var(--primary))" strokeWidth={2}
                    dot={{ r: 4, fill: "hsl(var(--primary))" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Matérias */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold font-display">Minhas Matérias</h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="hero" size="sm"><Plus className="w-4 h-4 mr-1" /> Nova Matéria</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-display">Criar Nova Matéria</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="materia-nome">Nome da matéria</Label>
                    <Input id="materia-nome" placeholder="Ex: Matemática, História..." value={novaMateria}
                      onChange={(e) => setNovaMateria(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criarMateria()} />
                  </div>
                  <Button variant="hero" className="w-full" onClick={criarMateria}>Criar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {materias.length === 0 ? (
            <Card className="border-dashed border-2 border-border">
              <CardContent className="py-12 text-center">
                <Brain className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">Nenhuma matéria ainda</p>
                <p className="text-sm text-muted-foreground">Crie sua primeira matéria para começar a estudar com IA</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {materias.map((m, i) => {
                const quizzesM = resultados.filter(r => r.materia_id === m.id);
                const mediaM = quizzesM.length > 0
                  ? (quizzesM.reduce((s, r) => s + Number(r.nota_estimada), 0) / quizzesM.length).toFixed(1) : null;
                const c = mediaM ? cls(Number(mediaM)) : null;
                return (
                  <Card key={m.id} className="shadow-card border-border/50 hover:shadow-elevated transition-shadow group"
                    style={{ animationDelay: `${i * 0.1}s` }}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-display text-lg cursor-pointer hover:text-primary transition-colors"
                          onClick={() => navigate(`/materia/${m.id}`)}>
                          {m.nome}
                        </CardTitle>
                        <Button variant="ghost" size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); deletarMateria(m.id); }}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 mb-3">
                        {mediaM ? (
                          <>
                            <span className={`text-lg font-bold font-display ${c?.color}`}>{mediaM}</span>
                            <span className="text-xs text-muted-foreground">média · {quizzesM.length} quiz{quizzesM.length !== 1 ? "zes" : ""}</span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Criada em {new Date(m.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/materia/${m.id}`)}>
                        Abrir matéria
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Resultados recentes */}
        {resultadosRecentes.length > 0 && (
          <div>
            <h2 className="text-xl font-bold font-display mb-4">Resultados Recentes</h2>
            <div className="space-y-3">
              {resultadosRecentes.map((r) => {
                const c = cls(Number(r.nota_estimada));
                const materia = materias.find(m => m.id === r.materia_id);
                return (
                  <Card key={r.id} className="shadow-card border-border/50">
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{materia?.nome || "Matéria"}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(r.created_at).toLocaleDateString("pt-BR")}
                          <span className="mx-1">·</span>
                          {r.acertos} acertos, {r.erros} erros
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/resultado/${r.id}`)}>
                              <Eye className="w-4 h-4 mr-2" /> Ver resultado
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/revisao/${r.id}`)}>
                              <Eye className="w-4 h-4 mr-2" /> Ver respostas
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteId(r.id)}>
                              <Trash2 className="w-4 h-4 mr-2" /> Apagar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="text-right">
                          <p className={`text-xl font-bold font-display ${c.color}`}>{Number(r.nota_estimada).toFixed(1)}</p>
                          <p className={`text-xs font-medium ${c.color}`}>{c.label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">Apagar resultado</AlertDialogTitle>
              <AlertDialogDescription>Deseja apagar este resultado? Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={deletarResultado} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Apagar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default DashboardPage;
