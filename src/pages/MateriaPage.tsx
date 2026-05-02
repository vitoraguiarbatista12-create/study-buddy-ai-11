import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Upload, FileText, Brain, Loader2, Trash2, ClipboardList,
  BarChart2, Sparkles, X, Pencil, Check
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

interface Documento { id: string; nome_arquivo: string; texto_extraido: string | null; created_at: string; }
interface ListaExercicio { id: string; titulo: string; questoes: any[]; created_at: string; }
interface Resultado { id: string; nota_estimada: number; acertos: number; erros: number; created_at: string; }

const MateriaPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [materia, setMateria] = useState<{ id: string; nome: string } | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [listas, setListas] = useState<ListaExercicio[]>([]);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [notaDesejada, setNotaDesejada] = useState(7);
  const [qtdQuestoes, setQtdQuestoes] = useState(10);
  const [uploading, setUploading] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importando, setImportando] = useState(false);

  // Renomear matéria
  const [editandoNome, setEditandoNome] = useState(false);
  const [novoNome, setNovoNome] = useState("");

  const iniciarEdicaoNome = () => {
    setNovoNome(materia?.nome || "");
    setEditandoNome(true);
  };

  const salvarNome = async () => {
    if (!novoNome.trim() || !materia) return;
    if (novoNome.trim() === materia.nome) { setEditandoNome(false); return; }
    const { error } = await supabase.from("materias").update({ nome: novoNome.trim() }).eq("id", materia.id);
    if (error) { toast.error("Erro ao renomear matéria"); return; }
    setMateria({ ...materia, nome: novoNome.trim() });
    toast.success("Nome atualizado!");
    setEditandoNome(false);
  };

  const cancelarEdicaoNome = () => {
    setEditandoNome(false);
    setNovoNome("");
  };

  // Resumo IA
  const [resumoOpen, setResumoOpen] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [gerandoResumo, setGerandoResumo] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [materiaRes, docsRes, listasRes, resultadosRes] = await Promise.all([
      supabase.from("materias").select("*").eq("id", id).single(),
      supabase.from("documentos").select("*").eq("materia_id", id).order("created_at", { ascending: false }),
      supabase.from("listas_exercicios").select("*").eq("materia_id", id).order("created_at", { ascending: false }),
      supabase.from("resultados").select("*").eq("materia_id", id).order("created_at", { ascending: true }),
    ]);
    if (materiaRes.data) setMateria(materiaRes.data);
    if (docsRes.data) setDocumentos(docsRes.data);
    if (listasRes.data) setListas(listasRes.data as any);
    if (resultadosRes.data) setResultados(resultadosRes.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(" ") + "\n";
    }
    return text;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;
    if (file.type !== "application/pdf") { toast.error("Apenas arquivos PDF são aceitos"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
    setUploading(true);
    try {
      const texto = await extractTextFromPDF(file);
      if (!texto.trim()) { toast.error("Não foi possível extrair texto do PDF"); setUploading(false); return; }
      const storagePath = `${user.id}/${id}/${Date.now()}_${file.name}`;
      await supabase.storage.from("pdfs").upload(storagePath, file);
      await supabase.from("documentos").insert({
        nome_arquivo: file.name, texto_extraido: texto.substring(0, 50000), materia_id: id, storage_path: storagePath,
      });
      toast.success("PDF enviado e texto extraído!");
      fetchData();
    } catch (err) { console.error(err); toast.error("Erro ao processar PDF"); }
    setUploading(false);
    e.target.value = "";
  };

  const deletarDocumento = async (docId: string) => {
    await supabase.from("documentos").delete().eq("id", docId);
    fetchData();
  };

  const gerarQuiz = async () => {
    if (documentos.length === 0) { toast.error("Envie ao menos um PDF primeiro"); return; }
    const textoCompleto = documentos.map(d => d.texto_extraido).filter(Boolean).join("\n\n");
    if (!textoCompleto.trim()) { toast.error("Nenhum texto extraído dos PDFs"); return; }
    setGerando(true);
    try {
      await supabase.from("metas_estudo").insert({ nota_desejada: notaDesejada, materia_id: id! });
      const { data, error } = await supabase.functions.invoke("gerar-questoes", {
        body: { texto: textoCompleto.substring(0, 15000), notaDesejada, materiaId: id, qtdQuestoes },
      });
      if (error) throw error;
      if (data?.resultadoId) { toast.success("Quiz gerado! Vamos começar!"); navigate(`/quiz/${data.resultadoId}`); }
      else toast.error("Erro ao gerar quiz");
    } catch (err) { console.error(err); toast.error("Erro ao gerar questões com IA"); }
    setGerando(false);
  };

  const gerarResumo = async () => {
    if (documentos.length === 0) { toast.error("Envie ao menos um PDF primeiro"); return; }
    const textoCompleto = documentos.map(d => d.texto_extraido).filter(Boolean).join("\n\n");
    if (!textoCompleto.trim()) { toast.error("Nenhum texto para resumir"); return; }

    setGerandoResumo(true);
    setResumoOpen(true);
    setResumo(null);

    try {
      const { data, error } = await supabase.functions.invoke("resumir-conteudo", {
        body: { texto: textoCompleto.substring(0, 15000), nomeMateria: materia?.nome },
      });
      if (error) throw error;
      setResumo(data?.resumo || "Não foi possível gerar o resumo.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar resumo");
      setResumo("Erro ao gerar resumo. Tente novamente.");
    }
    setGerandoResumo(false);
  };

  const handleImportLista = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;
    if (file.type !== "application/pdf") { toast.error("Apenas arquivos PDF são aceitos"); return; }
    setImportando(true);
    try {
      const texto = await extractTextFromPDF(file);
      if (!texto.trim()) { toast.error("Não foi possível extrair texto do PDF"); setImportando(false); return; }
      const { data, error } = await supabase.functions.invoke("extrair-lista", {
        body: { texto: texto.substring(0, 15000), materiaId: id },
      });
      if (error) throw error;
      if (data?.listaId) {
        toast.success(`${data.questoesCount} questões extraídas!`);
        setImportModalOpen(false);
        navigate(`/lista/${data.listaId}`);
      } else toast.error("Erro ao extrair questões");
    } catch (err) { console.error(err); toast.error("Erro ao processar lista de exercícios"); }
    setImportando(false);
    e.target.value = "";
  };

  const deletarLista = async (listaId: string) => {
    await supabase.from("listas_exercicios").delete().eq("id", listaId);
    toast.success("Lista excluída");
    fetchData();
  };

  if (loading) return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
  );

  if (!materia) return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Matéria não encontrada</p>
      </div>
  );

  const dificuldadeLabel = notaDesejada >= 8 ? "Difícil" : notaDesejada >= 5 ? "Médio" : "Fácil";
  const mediaNotas = resultados.length > 0
      ? (resultados.reduce((s, r) => s + Number(r.nota_estimada), 0) / resultados.length).toFixed(1) : null;
  const melhorNota = resultados.length > 0
      ? Math.max(...resultados.map(r => Number(r.nota_estimada))).toFixed(1) : null;
  const totalAcertos = resultados.reduce((s, r) => s + r.acertos, 0);
  const totalQuestoes = resultados.reduce((s, r) => s + r.acertos + r.erros, 0);
  const taxaAcerto = totalQuestoes > 0 ? ((totalAcertos / totalQuestoes) * 100).toFixed(0) : null;
  const dadosGrafico = resultados.slice(-8).map((r, i) => ({
    i: i + 1,
    nota: Number(r.nota_estimada),
    data: new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  }));

  return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3 flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              {editandoNome ? (
                  <div className="flex items-center gap-2">
                    <input
                        autoFocus
                        className="text-xl font-bold font-display bg-transparent border-b-2 border-primary outline-none w-full"
                        value={novoNome}
                        onChange={(e) => setNovoNome(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") salvarNome();
                          if (e.key === "Escape") cancelarEdicaoNome();
                        }}
                    />
                    <Button variant="ghost" size="icon" onClick={salvarNome} className="shrink-0 text-primary hover:text-primary">
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={cancelarEdicaoNome} className="shrink-0">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
              ) : (
                  <div className="flex items-center gap-2 group">
                    <h1 className="text-xl font-bold font-display">{materia.nome}</h1>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={iniciarEdicaoNome}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
              )}
              {resultados.length > 0 && (
                  <p className="text-xs text-muted-foreground">{resultados.length} quiz{resultados.length !== 1 ? "zes" : ""} · média {mediaNotas}</p>
              )}
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">

          {/* Stats */}
          {resultados.length > 0 && (
              <Card className="shadow-card border-border/50 animate-fade-in">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display flex items-center gap-2 text-base">
                    <BarChart2 className="w-4 h-4 text-primary" />
                    Desempenho em {materia.nome}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold font-display text-primary">{mediaNotas}</p>
                      <p className="text-xs text-muted-foreground">Média</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold font-display text-success">{melhorNota}</p>
                      <p className="text-xs text-muted-foreground">Melhor nota</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xl font-bold font-display">{taxaAcerto}%</p>
                      <p className="text-xs text-muted-foreground">Taxa de acerto</p>
                    </div>
                  </div>
                  {dadosGrafico.length >= 2 && (
                      <ResponsiveContainer width="100%" height={110}>
                        <LineChart data={dadosGrafico} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="data" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                          <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}
                                   formatter={(v: any) => [Number(v).toFixed(1), "Nota"]} />
                          <Line type="monotone" dataKey="nota" stroke="hsl(var(--primary))" strokeWidth={2}
                                dot={{ r: 3, fill: "hsl(var(--primary))" }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
          )}

          {/* Upload PDF */}
          <Card className="shadow-card border-border/50 animate-fade-in">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" /> Upload de PDF
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="pdf-upload"
                     className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors">
                {uploading ? <Loader2 className="w-8 h-8 text-primary animate-spin" /> : <Upload className="w-8 h-8 text-muted-foreground mb-2" />}
                <span className="text-sm text-muted-foreground">{uploading ? "Processando PDF..." : "Clique para enviar um PDF (máx 10MB)"}</span>
              </Label>
              <Input id="pdf-upload" type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
            </CardContent>
          </Card>

          {/* Documents */}
          {documentos.length > 0 && (
              <Card className="shadow-card border-border/50 animate-fade-in">
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <FileText className="w-5 h-5 text-secondary" /> Documentos ({documentos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {documentos.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{doc.nome_arquivo}</span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => deletarDocumento(doc.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                  ))}
                </CardContent>
              </Card>
          )}

          {/* Ações com IA */}
          <Card className="shadow-card border-border/50 animate-fade-in">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Brain className="w-5 h-5 text-accent" /> Ferramentas de IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Nota desejada para o quiz</Label>
                  <span className="text-sm font-medium text-primary">{notaDesejada} — {dificuldadeLabel}</span>
                </div>
                <Slider min={1} max={10} step={1} value={[notaDesejada]} onValueChange={([v]) => setNotaDesejada(v)} />
                <p className="text-xs text-muted-foreground mt-1">Quanto maior, mais difíceis serão as questões</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Quantidade de questões</Label>
                  <span className="text-sm font-medium text-primary">{qtdQuestoes} questões</span>
                </div>
                <Slider min={5} max={20} step={1} value={[qtdQuestoes]} onValueChange={([v]) => setQtdQuestoes(v)} />
                <p className="text-xs text-muted-foreground mt-1">De 5 (revisão rápida) a 20 (simulado completo)</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="hero" className="w-full" onClick={gerarQuiz} disabled={gerando || documentos.length === 0}>
                  {gerando
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando quiz...</>
                      : <><Brain className="w-4 h-4 mr-2" />Gerar Quiz</>}
                </Button>

                <Button
                    variant="outline"
                    className="w-full border-accent/30 hover:bg-accent/10 hover:border-accent/60 transition-colors"
                    onClick={gerarResumo}
                    disabled={gerandoResumo || documentos.length === 0}
                >
                  {gerandoResumo
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando resumo...</>
                      : <><Sparkles className="w-4 h-4 mr-2 text-accent" />Resumo para Prova</>}
                </Button>

                <Button
                    variant="outline"
                    className="w-full sm:col-span-2 border-secondary/30 hover:bg-secondary/10 hover:border-secondary/60 transition-colors"
                    onClick={() => navigate(`/flashcards/${id}`)}
                    disabled={documentos.length === 0}
                >
                  <span className="mr-2">🃏</span> Estudar com Flashcards
                </Button>
              </div>

              {documentos.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center">Envie um PDF para habilitar as ferramentas de IA</p>
              )}
            </CardContent>
          </Card>

          {/* Import Lista */}
          <Card className="shadow-card border-border/50 animate-fade-in">
            <CardContent className="pt-6">
              <Button variant="outline" className="w-full" onClick={() => setImportModalOpen(true)}>
                <ClipboardList className="w-4 h-4 mr-2" /> 📄 Importar Lista de Exercícios
              </Button>
            </CardContent>
          </Card>

          <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Importar Lista de Exercícios</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">Envie um PDF com sua lista. A IA extrai e estrutura as questões automaticamente.</p>
                <Label htmlFor="lista-upload"
                       className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors">
                  {importando
                      ? <><Loader2 className="w-8 h-8 text-primary animate-spin mb-2" /><span className="text-sm text-muted-foreground">Lendo sua lista...</span></>
                      : <><Upload className="w-8 h-8 text-muted-foreground mb-2" /><span className="text-sm text-muted-foreground">Clique para enviar um PDF</span></>}
                </Label>
                <Input id="lista-upload" type="file" accept=".pdf" className="hidden" onChange={handleImportLista} disabled={importando} />
              </div>
            </DialogContent>
          </Dialog>

          {/* Minhas Listas */}
          {listas.length > 0 && (
              <Card className="shadow-card border-border/50 animate-fade-in">
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-primary" /> Minhas Listas ({listas.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {listas.map((lista) => (
                      <div key={lista.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors flex-1"
                             onClick={() => navigate(`/lista/${lista.id}`)}>
                          <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <span className="text-sm font-medium truncate block">{lista.titulo}</span>
                            <span className="text-xs text-muted-foreground">{lista.questoes.length} questões · {new Date(lista.created_at).toLocaleDateString("pt-BR")}</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => deletarLista(lista.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                  ))}
                </CardContent>
              </Card>
          )}
        </main>

        {/* Sheet de Resumo */}
        <Sheet open={resumoOpen} onOpenChange={setResumoOpen}>
          <SheetContent className="w-full sm:max-w-2xl flex flex-col">
            <SheetHeader>
              <SheetTitle className="font-display flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                Resumo para Prova — {materia.nome}
              </SheetTitle>
            </SheetHeader>
            <ScrollArea className="flex-1 mt-4 pr-2">
              {gerandoResumo ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin text-accent" />
                    <p className="text-sm">Gerando resumo inteligente...</p>
                    <p className="text-xs opacity-60">Isso pode levar alguns segundos</p>
                  </div>
              ) : resumo ? (
                  <div className="prose prose-sm max-w-none text-foreground">
                    <ReactMarkdown>{resumo}</ReactMarkdown>
                  </div>
              ) : null}
            </ScrollArea>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setResumoOpen(false)}>
                <X className="w-4 h-4 mr-1" /> Fechar
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
  );
};

export default MateriaPage;