import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resultadoId, acertos, erros, nota, questoes } = await req.json();

    if (!resultadoId || questoes === undefined) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const classificacao = nota >= 8 ? "Avançado" : nota >= 5 ? "Médio" : "Fraco";

    const questoesResumo = questoes.map((q: any, i: number) => {
      const correto = q.respostaUsuario === q.respostaCorreta;
      return `${i + 1}. ${q.pergunta}\n   Resposta do aluno: ${q.respostaUsuario || "Não respondeu"} ${correto ? "✅" : `❌ (Correta: ${q.respostaCorreta})`}`;
    }).join("\n");

    const systemPrompt = `Você é um tutor educacional. Analise o desempenho do aluno e forneça feedback construtivo em português.

Estruture assim:
📊 RESUMO DO DESEMPENHO
- Nota, acertos/erros, classificação

💪 PONTOS FORTES
- O que o aluno demonstrou domínio

⚠️ PONTOS FRACOS
- Áreas que precisam de atenção

📚 SUGESTÕES DE MELHORIA
- Dicas específicas para melhorar

Seja encorajador mas honesto. Máximo 300 palavras.`;

    const userPrompt = `Resultado do quiz:
- Acertos: ${acertos}/${acertos + erros}
- Nota: ${nota.toFixed(1)}/10
- Classificação: ${classificacao}

Questões e respostas:
${questoesResumo}`;

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const feedback = aiData.choices?.[0]?.message?.content || "Feedback não disponível.";

    // Update resultado with feedback
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from("resultados").update({ feedback }).eq("id", resultadoId);

    return new Response(JSON.stringify({ feedback }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("feedback-quiz error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
