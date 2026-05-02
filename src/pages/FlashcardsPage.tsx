import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, RotateCcw, Loader2, Layers,
  CheckCircle, XCircle, Shuffle
} from "lucide-react";

interface Flashcard {
  frente: string;
  verso: string;
}

const FlashcardsPage = () => {
  const { materiaId } = useParams<{ materiaId: string }>();
  const navigate = useNavigate();
  const [materiaName, setMateriaName] = useState("");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [unknown, setUnknown] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!materiaId) return;
    const load = async () => {
      const [materiaRes, docsRes] = await Promise.all([
        supabase.from("materias").select("nome").eq("id", materiaId).single(),
        supabase.from("documentos").select("texto_extraido").eq("materia_id", materiaId),
      ]);
      if (materiaRes.data) setMateriaName(materiaRes.data.nome);

      // Check for cached flashcards
      const { data: cached } = await supabase
        .from("flashcards")
        .select("cards")
        .eq("materia_id", materiaId)
        .single();

      if (cached?.cards) {
        setCards(cached.cards as Flashcard[]);
        setLoading(false);
        return;
      }

      // Generate new flashcards
      const textos = (docsRes.data || []).map(d => d.texto_extraido).filter(Boolean).join("\n\n");
      if (!textos) {
        toast.error("Nenhum PDF encontrado. Envie um PDF na matéria primeiro.");
        navigate(`/materia/${materiaId}`);
        return;
      }

      setGenerating(true);
      setLoading(false);

      try {
        const { data, error } = await supabase.functions.invoke("gerar-flashcards", {
          body: { texto: textos.substring(0, 15000), nomeMateria: materiaRes.data?.nome },
        });
        if (error) throw error;

        const flashcards = data?.flashcards || [];
        setCards(flashcards);

        // Cache it
        await supabase.from("flashcards").upsert({
          materia_id: materiaId,
          cards: flashcards,
        });
      } catch (err) {
        console.error(err);
        toast.error("Erro ao gerar flashcards");
      }
      setGenerating(false);
    };
    load();
  }, [materiaId]);

  const handleFlip = () => setFlipped(f => !f);

  const handleKnew = () => {
    setKnown(prev => new Set([...prev, currentIdx]));
    advance();
  };

  const handleDidntKnow = () => {
    setUnknown(prev => new Set([...prev, currentIdx]));
    advance();
  };

  const advance = () => {
    setFlipped(false);
    setTimeout(() => {
      if (currentIdx < cards.length - 1) setCurrentIdx(i => i + 1);
      else setFinished(true);
    }, 150);
  };

  const restart = () => {
    setCurrentIdx(0);
    setFlipped(false);
    setKnown(new Set());
    setUnknown(new Set());
    setFinished(false);
  };

  const shuffleCards = () => {
    setCards(prev => [...prev].sort(() => Math.random() - 0.5));
    restart();
    toast.success("Cartas embaralhadas!");
  };

  const reviewUnknown = () => {
    const unknownCards = [...unknown].map(i => cards[i]);
    setCards(unknownCards);
    restart();
  };

  const regenerate = async () => {
    await supabase.from("flashcards").delete().eq("materia_id", materiaId);
    window.location.reload();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );

  if (generating) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto">
          <Layers className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold font-display">Gerando Flashcards</h2>
        <p className="text-muted-foreground text-sm">A IA está criando cartões de estudo a partir do seu PDF...</p>
        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
      </div>
    </div>
  );

  if (finished) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-6 animate-fade-in">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold font-display">Sessão concluída!</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-success/10 border border-success/20">
            <p className="text-3xl font-bold font-display text-success">{known.size}</p>
            <p className="text-sm text-muted-foreground">Sabia</p>
          </div>
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <p className="text-3xl font-bold font-display text-destructive">{unknown.size}</p>
            <p className="text-sm text-muted-foreground">Não sabia</p>
          </div>
        </div>
        <div className="space-y-3">
          {unknown.size > 0 && (
            <Button variant="hero" className="w-full" onClick={reviewUnknown}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Revisar os {unknown.size} que não soube
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={restart}>
            <Shuffle className="w-4 h-4 mr-2" /> Recomeçar
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate(`/materia/${materiaId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar à Matéria
          </Button>
        </div>
      </div>
    </div>
  );

  const card = cards[currentIdx];
  const progress = ((currentIdx) / cards.length) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm px-4 py-3">
        <div className="container mx-auto max-w-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/materia/${materiaId}`)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-base font-bold font-display">Flashcards — {materiaName}</h1>
              <p className="text-xs text-muted-foreground">{currentIdx + 1} de {cards.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={shuffleCards} title="Embaralhar">
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={regenerate} title="Regerar">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="container mx-auto max-w-2xl mt-2">
          <Progress value={progress} className="h-1.5" />
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-2xl px-4 py-8 flex flex-col items-center justify-center gap-6">
        {/* Score pills */}
        <div className="flex gap-3">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success text-sm font-medium">
            <CheckCircle className="w-3.5 h-3.5" /> {known.size}
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-sm font-medium">
            <XCircle className="w-3.5 h-3.5" /> {unknown.size}
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm font-medium">
            {cards.length - currentIdx - 1} restantes
          </span>
        </div>

        {/* Flip card */}
        <div
          className="w-full max-w-lg cursor-pointer"
          style={{ perspective: "1000px" }}
          onClick={handleFlip}
        >
          <div
            className="relative w-full transition-transform duration-500"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              height: "260px",
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 rounded-2xl border-2 border-border shadow-elevated bg-card flex flex-col items-center justify-center p-8 text-center"
              style={{ backfaceVisibility: "hidden" }}
            >
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4 font-medium">Conceito</p>
              <p className="text-xl font-semibold font-display leading-relaxed">{card.frente}</p>
              <p className="text-xs text-muted-foreground mt-6">Toque para revelar</p>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 rounded-2xl border-2 border-primary/30 shadow-elevated gradient-primary flex flex-col items-center justify-center p-8 text-center"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <p className="text-xs text-primary-foreground/70 uppercase tracking-widest mb-4 font-medium">Definição</p>
              <p className="text-lg font-medium leading-relaxed text-primary-foreground">{card.verso}</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {flipped ? "Você sabia?" : "Tente lembrar antes de virar"}
        </p>

        {/* Actions */}
        <div className={`flex gap-4 w-full max-w-sm transition-opacity duration-200 ${flipped ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
          <Button
            variant="outline"
            className="flex-1 border-destructive/40 hover:bg-destructive/10 hover:border-destructive text-destructive"
            onClick={handleDidntKnow}
          >
            <XCircle className="w-4 h-4 mr-2" /> Não sabia
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-success/40 hover:bg-success/10 hover:border-success text-success"
            onClick={handleKnew}
          >
            <CheckCircle className="w-4 h-4 mr-2" /> Sabia!
          </Button>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button variant="ghost" size="icon" onClick={() => { setCurrentIdx(i => Math.max(0, i - 1)); setFlipped(false); }}
            disabled={currentIdx === 0}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setFlipped(false); setTimeout(() => setCurrentIdx(i => Math.min(cards.length - 1, i + 1)), 150); }}
            disabled={currentIdx === cards.length - 1}>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </main>
    </div>
  );
};

export default FlashcardsPage;
