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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
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

    const systemPrompt = `Você é um professor especialista que gera questões de prova. Gere exatamente 10 questões de múltipla escolha baseadas no texto fornecido.

Nível de dificuldade: ${dificuldade} (nota desejada: ${nota}/10)

REGRAS:
- Cada questão deve ter exatamente 4 alternativas
- Apenas uma alternativa deve ser correta
- As questões devem cobrir diferentes partes do conteúdo
- Para dificuldade "fácil": questões diretas e conceituais
- Para dificuldade "médio": questões que exigem compreensão e relação entre conceitos
- Para dificuldade "difícil": questões de análise, aplicação e pensamento crítico

Responda APENAS com um array JSON válido no formato:
[
  {
    "pergunta": "texto da pergunta",
    "alternativas": ["alternativa A", "alternativa B", "alternativa C", "alternativa D"],
    "resposta": "alternativa correta (texto exato de uma das alternativas)"
  }
]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Gere questões baseadas neste texto:\n\n${texto.substring(0, 12000)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "gerar_questoes",
              description: "Gera uma lista de 10 questões de múltipla escolha",
              parameters: {
                type: "object",
                properties: {
                  questoes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pergunta: { type: "string" },
                        alternativas: { type: "array", items: { type: "string" } },
                        resposta: { type: "string" }
                      },
                      required: ["pergunta", "alternativas", "resposta"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["questoes"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "gerar_questoes" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    let questoes: any[] = [];

    // Extract from tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      questoes = parsed.questoes || [];
    }

    if (questoes.length === 0) {
      // Fallback: try to parse content directly
      const content = aiData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questoes = JSON.parse(jsonMatch[0]);
      }
    }

    if (questoes.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to generate questions" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create resultado first
    const { data: resultadoData, error: resultadoError } = await supabase
      .from("resultados")
      .insert({
        acertos: 0,
        erros: 0,
        nota_estimada: 0,
        user_id: userId,
        materia_id: materiaId,
      })
      .select("id")
      .single();

    if (resultadoError) throw resultadoError;
    const resultadoId = resultadoData.id;

    // Insert questoes
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
