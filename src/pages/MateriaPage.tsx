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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Upload, FileText, Brain, Loader2, Trash2, ClipboardList
} from "lucide-react";

interface Documento {
  id: string;
  nome_arquivo: string;
  texto_extraido: string | null;
  created_at: string;
}

interface ListaExercicio {
  id: string;
  titulo: string;
  questoes: any[];
  created_at: string;
}

const MateriaPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [materia, setMateria] = useState<{ id: string; nome: string } | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [listas, setListas] = useState<ListaExercicio[]>([]);
  const [notaDesejada, setNotaDesejada] = useState(7);
  const [uploading, setUploading] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importando, setImportando] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [materiaRes, docsRes, listasRes] = await Promise.all([
      supabase.from("materias").select("*").eq("id", id).single(),
      supabase.from("documentos").select("*").eq("materia_id", id).order("created_at", { ascending: false }),
      supabase.from("listas_exercicios").select("*").eq("materia_id", id).order("created_at", { ascending: false }),
    ]);
    if (materiaRes.data) setMateria(materiaRes.data);
    if (docsRes.data) setDocumentos(docsRes.data);
    if (listasRes.data) setListas(listasRes.data as any);
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
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são aceitos");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 10MB)");
      return;
    }

    setUploading(true);
    try {
      const texto = await extractTextFromPDF(file);
      if (!texto.trim()) {
        toast.error("Não foi possível extrair texto do PDF");
        setUploading(false);
        return;
      }

      const storagePath = `${user.id}/${id}/${Date.now()}_${file.name}`;
      await supabase.storage.from("pdfs").upload(storagePath, file);

      await supabase.from("documentos").insert({
        nome_arquivo: file.name,
        texto_extraido: texto.substring(0, 50000),
        materia_id: id,
        storage_path: storagePath,
      });

      toast.success("PDF enviado e texto extraído!");
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao processar PDF");
    }
    setUploading(false);
    e.target.value = "";
  };

  const deletarDocumento = async (docId: string) => {
    await supabase.from("documentos").delete().eq("id", docId);
    fetchData();
  };

  const gerarQuiz = async () => {
    if (documentos.length === 0) {
      toast.error("Envie ao menos um PDF primeiro");
      return;
    }

    const textoCompleto = documentos
      .map((d) => d.texto_extraido)
      .filter(Boolean)
      .join("\n\n");

    if (!textoCompleto.trim()) {
      toast.error("Nenhum texto extraído dos PDFs");
      return;
    }

    setGerando(true);
    try {
      await supabase.from("metas_estudo").insert({
        nota_desejada: notaDesejada,
        materia_id: id!,
      });

      const { data, error } = await supabase.functions.invoke("gerar-questoes", {
        body: {
          texto: textoCompleto.substring(0, 15000),
          notaDesejada,
          materiaId: id,
        },
      });

      if (error) throw error;

      if (data?.resultadoId) {
        toast.success("Quiz gerado! Vamos começar!");
        navigate(`/quiz/${data.resultadoId}`);
      } else {
        toast.error("Erro ao gerar quiz");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar questões com IA");
    }
    setGerando(false);
  };

  const handleImportLista = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são aceitos");
      return;
    }

    setImportando(true);
    try {
      const texto = await extractTextFromPDF(file);
      if (!texto.trim()) {
        toast.error("Não foi possível extrair texto do PDF");
        setImportando(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("extrair-lista", {
        body: { texto: texto.substring(0, 15000), materiaId: id },
      });

      if (error) throw error;

      if (data?.listaId) {
        toast.success(`${data.questoesCount} questões extraídas!`);
        setImportModalOpen(false);
        navigate(`/lista/${data.listaId}`);
      } else {
        toast.error("Erro ao extrair questões");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao processar lista de exercícios");
    }
    setImportando(false);
    e.target.value = "";
  };

  const deletarLista = async (listaId: string) => {
    await supabase.from("listas_exercicios").delete().eq("id", listaId);
    toast.success("Lista excluída");
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!materia) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Matéria não encontrada</p>
      </div>
    );
  }

  const dificuldadeLabel = notaDesejada >= 8 ? "Difícil" : notaDesejada >= 5 ? "Médio" : "Fácil";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold font-display">{materia.nome}</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Upload PDF */}
        <Card className="shadow-card border-border/50 animate-fade-in">
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Upload de PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label
              htmlFor="pdf-upload"
              className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
              )}
              <span className="text-sm text-muted-foreground">
                {uploading ? "Processando PDF..." : "Clique para enviar um PDF (máx 10MB)"}
              </span>
            </Label>
            <Input
              id="pdf-upload"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </CardContent>
        </Card>

        {/* Documents List */}
        {documentos.length > 0 && (
          <Card className="shadow-card border-border/50 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <FileText className="w-5 h-5 text-secondary" />
                Documentos ({documentos.length})
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

        {/* Generate Quiz */}
        <Card className="shadow-card border-border/50 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Brain className="w-5 h-5 text-accent" />
              Gerar Quiz com IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Nota desejada</Label>
                <span className="text-sm font-medium text-primary">
                  {notaDesejada.toFixed(0)} — {dificuldadeLabel}
                </span>
              </div>
              <Slider
                min={1}
                max={10}
                step={1}
                value={[notaDesejada]}
                onValueChange={([v]) => setNotaDesejada(v)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Quanto maior a nota, mais difíceis serão as questões
              </p>
            </div>
            <Button
              variant="hero"
              className="w-full"
              onClick={gerarQuiz}
              disabled={gerando || documentos.length === 0}
            >
              {gerando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando questões...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Gerar Quiz ({documentos.length} PDF{documentos.length !== 1 ? "s" : ""})
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Import Exercise List Button */}
        <Card className="shadow-card border-border/50 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <CardContent className="pt-6">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setImportModalOpen(true)}
            >
              <ClipboardList className="w-4 h-4 mr-2" />
              📄 Importar Lista de Exercícios
            </Button>
          </CardContent>
        </Card>

        {/* Import Modal */}
        <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Importar Lista de Exercícios</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Envie um PDF com sua lista de exercícios. A IA irá extrair e estruturar as questões automaticamente.
              </p>
              <Label
                htmlFor="lista-upload"
                className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors"
              >
                {importando ? (
                  <>
                    <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
                    <span className="text-sm text-muted-foreground">Lendo sua lista de exercícios...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Clique para enviar um PDF</span>
                  </>
                )}
              </Label>
              <Input
                id="lista-upload"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleImportLista}
                disabled={importando}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Minhas Listas */}
        {listas.length > 0 && (
          <Card className="shadow-card border-border/50 animate-fade-in" style={{ animationDelay: "0.4s" }}>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Minhas Listas ({listas.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {listas.map((lista) => (
                <div key={lista.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div
                    className="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors flex-1"
                    onClick={() => navigate(`/lista/${lista.id}`)}
                  >
                    <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium truncate block">{lista.titulo}</span>
                      <span className="text-xs text-muted-foreground">
                        {lista.questoes.length} questões · {new Date(lista.created_at).toLocaleDateString("pt-BR")}
                      </span>
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
    </div>
  );
};

export default MateriaPage;
