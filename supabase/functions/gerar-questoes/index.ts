import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texto, notaDesejada, materiaId } = await req.json();

    if (!texto || !materiaId) {
      return new Response(JSON.stringify({ error: "Missing texto or materiaId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nota = notaDesejada || 7;
    const dificuldade = nota >= 8 ? "difícil" : nota >= 5 ? "médio" : "fácil";

    const systemPrompt = `Você é um professor especialista que gera questões de prova sobre o CONTEÚDO da disciplina.

Nível de dificuldade: ${dificuldade} (nota desejada: ${nota}/10)

REGRAS OBRIGATÓRIAS:
- Gere exatamente 10 questões de múltipla escolha
- Cada questão deve ter exatamente 4 alternativas
- Apenas uma alternativa deve ser correta
- As questões devem testar o CONHECIMENTO DO CONTEÚDO — conceitos, teorias, processos, fórmulas, definições, aplicações práticas

PROIBIDO — NUNCA pergunte sobre:
- Carga horária, duração ou estrutura do curso
- Objetivos gerais ou específicos do curso/disciplina
- Critérios de avaliação, notas ou formas de avaliação
- Nome da instituição, professor ou autores do material
- Ementa, bibliografia ou referências bibliográficas
- Qualquer informação administrativa ou burocrática do documento

FOQUE EM:
- Conceitos, definições e terminologias do assunto
- Processos, etapas ou mecanismos descritos no conteúdo
- Relações de causa e efeito dentro do tema
- Aplicações práticas e exemplos do conteúdo
- Comparações entre tecnologias, métodos ou abordagens apresentadas

Para dificuldade "fácil": questões diretas sobre definições e conceitos básicos
Para dificuldade "médio": questões que exigem compreensão e relação entre conceitos
Para dificuldade "difícil": questões de análise, aplicação e pensamento crítico

Responda APENAS com um array JSON válido, sem texto antes ou depois, sem blocos de markdown:
[
  {
    "pergunta": "texto da pergunta",
    "alternativas": ["alternativa A", "alternativa B", "alternativa C", "alternativa D"],
    "resposta": "alternativa correta (texto exato de uma das alternativas)"
  }
]`;

    // Groq usa a mesma interface da OpenAI
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Gere questões baseadas neste texto:\n\n${texto.substring(0, 12000)}` },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq error:", response.status, errText);
      throw new Error(`Groq error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let questoes: any[] = [];
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      questoes = JSON.parse(jsonMatch[0]);
    }

    if (questoes.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to generate questions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: resultadoData, error: resultadoError } = await supabase
        .from("resultados")
        .insert({ acertos: 0, erros: 0, nota_estimada: 0, user_id: userId, materia_id: materiaId })
        .select("id")
        .single();

    if (resultadoError) throw resultadoError;
    const resultadoId = resultadoData.id;

    const questoesInsert = questoes.slice(0, 10).map((q: any) => ({
      pergunta: q.pergunta,
      alternativas: q.alternativas,
      resposta_correta: q.resposta,
      materia_id: materiaId,
      resultado_id: resultadoId,
    }));

    const { error: insertError } = await supabase.from("questoes").insert(questoesInsert);
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ resultadoId, questoesCount: questoesInsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gerar-questoes error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});