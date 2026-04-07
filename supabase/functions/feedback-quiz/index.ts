import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update resultado with acertos, erros, nota using service role (bypasses RLS)
    await supabase
      .from("resultados")
      .update({ acertos, erros, nota_estimada: nota })
      .eq("id", resultadoId);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const questoesResumo = questoes.map((q: any, i: number) => {
      const correto = q.respostaUsuario === q.respostaCorreta;
      return `${i + 1}. ${q.pergunta} → Aluno: ${q.respostaUsuario || "Não respondeu"} ${correto ? "✅" : `❌ (Correta: ${q.respostaCorreta})`}`;
    }).join("\n");

    const systemPrompt = `Você é um tutor educacional direto e objetivo. Responda APENAS em português, sem introduções, saudações ou repetição de nota/classificação. Use markdown para formatar.`;

    const userPrompt = `Acertos: ${acertos}/${acertos + erros}. Nota: ${nota.toFixed(1)}/10.

Questões:
${questoesResumo}

Responda EXATAMENTE neste formato (sem mais nada):

**Avaliação:** (uma frase curta sobre o desempenho geral)

**Pontos fracos:**
- (ponto 1)
- (ponto 2)
- (ponto 3, se houver)

**Sugestões de melhoria:**
- (sugestão 1)
- (sugestão 2)
- (sugestão 3, se houver)`;

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
