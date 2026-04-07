import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { enunciado, alternativas, historico } = await req.json();
    if (!enunciado) {
      return new Response(JSON.stringify({ error: "Missing enunciado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Verify auth
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um professor particular paciente e didático. O aluno está tentando resolver a questão abaixo e precisa de ajuda para raciocinar — mas NÃO dê a resposta diretamente.

Sua função é:
1. Identificar o conceito principal sendo testado
2. Relembrar fórmulas, definições ou regras relevantes de forma clara
3. Dar uma dica de raciocínio ou passo inicial para resolver
4. Se for cálculo, mostre o caminho lógico sem resolver completamente
5. Usar linguagem simples, como se estivesse explicando para um aluno do ensino médio ou faculdade

Nunca entregue a resposta final. Guie, não resolva.`;

    let questaoTexto = enunciado;
    if (alternativas && alternativas.length > 0) {
      questaoTexto += "\n\nAlternativas:\n" + alternativas.join("\n");
    }

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history if present
    if (historico && Array.isArray(historico) && historico.length > 0) {
      messages.push(...historico);
      messages.push({ role: "user", content: "Preciso de mais uma dica para avançar na resolução." });
    } else {
      messages.push({ role: "user", content: `Preciso de ajuda com esta questão:\n\n${questaoTexto}` });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
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
    const content = aiData.choices?.[0]?.message?.content || "Não consegui gerar uma dica no momento.";

    return new Response(JSON.stringify({ resposta: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("assistente-questao error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
