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
  Trash2, MoreVertical, Eye
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

interface Materia {
  id: string;
  nome: string;
  created_at: string;
}

interface Resultado {
  id: string;
  acertos: number;
  erros: number;
  nota_estimada: number;
  materia_id: string;
  created_at: string;
}

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [materiasRes, resultadosRes, profileRes] = await Promise.all([
      supabase.from("materias").select("*").order("created_at", { ascending: false }),
      supabase.from("resultados").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("profiles").select("nome").eq("user_id", user!.id).single(),
    ]);
    if (materiasRes.data) setMaterias(materiasRes.data);
    if (resultadosRes.data) setResultados(resultadosRes.data);
    if (profileRes.data) setProfile(profileRes.data);
    setLoading(false);
  };

  const criarMateria = async () => {
    if (!novaMateria.trim()) {
      toast.error("Digite o nome da matéria");
      return;
    }
    const { error } = await supabase
      .from("materias")
      .insert({ nome: novaMateria.trim(), user_id: user!.id });
    if (error) {
      toast.error("Erro ao criar matéria");
    } else {
      toast.success("Matéria criada!");
      setNovaMateria("");
      setDialogOpen(false);
      fetchData();
    }
  };

  const deletarMateria = async (id: string) => {
    const { error } = await supabase.from("materias").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else fetchData();
  };

  const deletarResultado = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("resultados").delete().eq("id", deleteId);
    if (error) {
      toast.error("Erro ao apagar resultado");
    } else {
      setResultados((prev) => prev.filter((r) => r.id !== deleteId));
      toast.success("Resultado apagado");
    }
    setDeleteId(null);
  };
  };

  const mediaGeral = resultados.length > 0
    ? (resultados.reduce((s, r) => s + Number(r.nota_estimada), 0) / resultados.length).toFixed(1)
    : "—";

  const classificacao = (nota: number) => {
    if (nota >= 8) return { label: "Avançado", color: "text-success" };
    if (nota >= 5) return { label: "Médio", color: "text-warning" };
    return { label: "Fraco", color: "text-destructive" };
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold font-display gradient-text">StudyAI</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Olá, {profile?.nome || user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-fade-in">
          <Card className="shadow-card border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-display">{materias.length}</p>
                  <p className="text-sm text-muted-foreground">Matérias</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Target className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-display">{resultados.length}</p>
                  <p className="text-sm text-muted-foreground">Quizzes feitos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold font-display">{mediaGeral}</p>
                  <p className="text-sm text-muted-foreground">Média Geral</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Materias */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold font-display">Minhas Matérias</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="hero" size="sm">
                <Plus className="w-4 h-4 mr-1" /> Nova Matéria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Criar Nova Matéria</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="materia-nome">Nome da matéria</Label>
                  <Input
                    id="materia-nome"
                    placeholder="Ex: Matemática, História..."
                    value={novaMateria}
                    onChange={(e) => setNovaMateria(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && criarMateria()}
                  />
                </div>
                <Button variant="hero" className="w-full" onClick={criarMateria}>
                  Criar
                </Button>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {materias.map((m, i) => (
              <Card
                key={m.id}
                className="shadow-card border-border/50 hover:shadow-elevated transition-shadow cursor-pointer group"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle
                      className="font-display text-lg cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/materia/${m.id}`)}
                    >
                      {m.nome}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); deletarMateria(m.id); }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Criada em {new Date(m.created_at).toLocaleDateString("pt-BR")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => navigate(`/materia/${m.id}`)}
                  >
                    Abrir matéria
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Recent Results */}
        {resultados.length > 0 && (
          <>
            <h2 className="text-xl font-bold font-display mb-4">Resultados Recentes</h2>
            <div className="space-y-3">
              {resultados.slice(0, 5).map((r) => {
                const cls = classificacao(Number(r.nota_estimada));
                const materia = materias.find(m => m.id === r.materia_id);
                return (
                  <Card key={r.id} className="shadow-card border-border/50">
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{materia?.nome || "Matéria"}</p>
                        <p className="text-sm text-muted-foreground">
                          {r.acertos} acertos, {r.erros} erros
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold font-display ${cls.color}`}>
                          {Number(r.nota_estimada).toFixed(1)}
                        </p>
                        <p className={`text-xs font-medium ${cls.color}`}>{cls.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default DashboardPage;
