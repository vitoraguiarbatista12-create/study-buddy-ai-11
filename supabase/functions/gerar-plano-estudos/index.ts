import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { resumoDesempenho, totalQuizzes, materias } = await req.json();
    // materias = [{ id, nome, media, quizzes }]

    // Buscar textos reais dos PDFs de cada matéria
    let conteudosPorMateria = "";
    if (materias && Array.isArray(materias)) {
      for (const m of materias) {
        const { data: docs } = await supabase
          .from("documentos")
          .select("texto_extraido, nome_arquivo")
          .eq("materia_id", m.id)
          .limit(2);

        if (docs && docs.length > 0) {
          const textoMateria = docs
            .map(d => d.texto_extraido || "")
            .join(" ")
            .substring(0, 3000); // até 3000 chars por matéria

          conteudosPorMateria += `\n\n### Matéria: ${m.nome} (média: ${m.media.toFixed(1)}, ${m.quizzes} quizzes)\nConteúdo real do PDF:\n${textoMateria}`;
        } else {
          conteudosPorMateria += `\n\n### Matéria: ${m.nome} (média: ${m.media.toFixed(1)}, ${m.quizzes} quizzes)\n(Sem PDF enviado ainda)`;
        }
      }
    }

    const prompt = `Você é um tutor educacional especialista em planos de estudo personalizados.

O aluno completou ${totalQuizzes} quizzes. Desempenho por matéria:
${resumoDesempenho}

Conteúdo real de cada matéria (extraído dos PDFs do aluno):
${conteudosPorMateria}

IMPORTANTE: Use o conteúdo real dos PDFs para dar dicas específicas. Por exemplo, se o PDF de uma matéria fala sobre "cálculo diferencial", cite isso. Se fala sobre "Segunda Guerra Mundial", cite isso. Seja específico ao conteúdo real, não genérico.

Crie um plano de estudos semanal personalizado em português considerando:
- Matérias com nota abaixo de 6 precisam de mais atenção
- Matérias com nota acima de 8 precisam apenas de revisão
- O plano deve ser realista (não sobrecarregar)
- Cite tópicos reais do conteúdo dos PDFs nas atividades

Formato EXATO (use markdown):

## 📊 Diagnóstico
(2-3 frases sobre o desempenho, citando os tópicos reais dos PDFs onde o aluno está mais fraco)

## 🗓️ Plano Semanal

**Segunda e Terça**
- (matéria mais fraca): (atividade específica com tópico real do PDF)

**Quarta e Quinta**
- (segunda matéria): (atividade específica com tópico real do PDF)

**Sexta**
- (revisão das matérias fortes — cite tópicos específicos)

**Sábado**
- (simulado ou revisão geral com foco nos pontos fracos identificados)

## 💡 Dicas Personalizadas
- (dica 1 baseada no conteúdo real dos PDFs)
- (dica 2)
- (dica 3)

## 🎯 Meta da Semana
(meta concreta e mensurável, mencionando tópico específico do conteúdo)`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) throw new Error(`Groq error: ${response.status}`);
    const aiData = await response.json();
    const plano = aiData.choices?.[0]?.message?.content || "Não foi possível gerar o plano.";

    return new Response(JSON.stringify({ plano }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("gerar-plano-estudos error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
