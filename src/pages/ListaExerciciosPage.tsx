import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft, Brain, Loader2, X, MessageCircle
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Questao {
  numero: number;
  enunciado: string;
  alternativas?: string[];
  tipo: string;
}

interface HistoricoMsg {
  role: "user" | "assistant";
  content: string;
}

const ListaExerciciosPage = () => {
  const { listaId } = useParams<{ listaId: string }>();
  const navigate = useNavigate();
  const [lista, setLista] = useState<{ id: string; titulo: string; questoes: Questao[]; materia_id: string } | null>(null);
  const [materiaNome, setMateriaNome] = useState("");
  const [loading, setLoading] = useState(true);

  // AI assistant state
  const [assistOpen, setAssistOpen] = useState(false);
  const [activeQuestao, setActiveQuestao] = useState<Questao | null>(null);
  const [historico, setHistorico] = useState<HistoricoMsg[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const fetchLista = async () => {
      if (!listaId) return;
      const { data } = await supabase
        .from("listas_exercicios")
        .select("*")
        .eq("id", listaId)
        .single();

      if (data) {
        setLista(data as any);
        const { data: mat } = await supabase
          .from("materias")
          .select("nome")
          .eq("id", data.materia_id)
          .single();
        if (mat) setMateriaNome(mat.nome);
      }
      setLoading(false);
    };
    fetchLista();
  }, [listaId]);

  const pedirAjuda = async (questao: Questao, historicoAtual: HistoricoMsg[] = []) => {
    setActiveQuestao(questao);
    setAssistOpen(true);
    setAiLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("assistente-questao", {
        body: {
          enunciado: questao.enunciado,
          alternativas: questao.alternativas,
          historico: historicoAtual.length > 0 ? historicoAtual : undefined,
        },
      });

      if (error) throw error;

      const userMsg: HistoricoMsg = {
        role: "user",
        content: historicoAtual.length > 0
          ? "Preciso de mais uma dica para avançar na resolução."
          : `Preciso de ajuda com esta questão:\n\n${questao.enunciado}${questao.alternativas ? "\n\nAlternativas:\n" + questao.alternativas.join("\n") : ""}`,
      };
      const assistantMsg: HistoricoMsg = { role: "assistant", content: data.resposta };

      setHistorico((prev) => [...prev, userMsg, assistantMsg]);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao consultar o assistente");
    }
    setAiLoading(false);
  };

  const pedirMaisDica = () => {
    if (!activeQuestao) return;
    pedirAjuda(activeQuestao, historico);
  };

  const abrirAssistente = (questao: Questao) => {
    setHistorico([]);
    pedirAjuda(questao);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!lista) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Lista não encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold font-display">{lista.titulo}</h1>
            {materiaNome && (
              <p className="text-sm text-muted-foreground">{materiaNome} · {lista.questoes.length} questões</p>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
        {lista.questoes.map((q, idx) => (
          <Card key={idx} className="shadow-card border-border/50 animate-fade-in" style={{ animationDelay: `${idx * 0.05}s` }}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="font-display text-base">
                  Questão {q.numero || idx + 1}
                  {q.tipo === "dissertativa" && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      Dissertativa
                    </span>
                  )}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => abrirAssistente(q)}
                >
                  <Brain className="w-4 h-4 mr-1" />
                  Ajuda IA
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.enunciado}</p>
              {q.alternativas && q.alternativas.length > 0 && (
                <div className="space-y-1.5 pl-1">
                  {q.alternativas.map((alt, ai) => (
                    <div key={ai} className="text-sm p-2 rounded bg-muted/50">
                      {alt}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </main>

      {/* AI Assistant Sheet */}
      <Sheet open={assistOpen} onOpenChange={setAssistOpen}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <SheetTitle className="font-display flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              Assistente de Estudos
            </SheetTitle>
          </SheetHeader>

          {activeQuestao && (
            <div className="mt-2 p-3 rounded-lg bg-muted/50 text-sm">
              <p className="font-medium text-xs text-muted-foreground mb-1">Questão {activeQuestao.numero}</p>
              <p className="line-clamp-3">{activeQuestao.enunciado}</p>
            </div>
          )}

          <ScrollArea className="flex-1 mt-4 pr-2">
            <div className="space-y-4">
              {historico
                .filter((m) => m.role === "assistant")
                .map((msg, i) => (
                  <div key={i} className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageCircle className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium text-primary">
                        {i === 0 ? "Dica" : `Dica ${i + 1}`}
                      </span>
                    </div>
                    <div className="prose prose-sm max-w-none text-foreground">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              {aiLoading && (
                <div className="flex items-center gap-2 p-3 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Pensando...</span>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={pedirMaisDica}
              disabled={aiLoading}
            >
              <Brain className="w-4 h-4 mr-1" />
              Pedir mais uma dica
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAssistOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ListaExerciciosPage;
