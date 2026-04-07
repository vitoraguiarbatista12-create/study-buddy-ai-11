import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texto, materiaId } = await req.json();
    if (!texto || !materiaId) {
      return new Response(JSON.stringify({ error: "Missing texto or materiaId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um assistente que extrai questões de listas de exercícios a partir de texto de PDFs acadêmicos.
Analise o texto e identifique cada questão individualmente. Para cada questão, extraia:
- O número da questão
- O enunciado completo
- As alternativas (se for múltipla escolha)
- O tipo: "multipla_escolha" ou "dissertativa"

Ignore imagens, gráficos ou referências visuais que não podem ser interpretadas como texto.`
          },
          {
            role: "user",
            content: `Extraia as questões desta lista de exercícios:\n\n${texto.substring(0, 15000)}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extrair_questoes",
            description: "Extrai questões estruturadas de uma lista de exercícios",
            parameters: {
              type: "object",
              properties: {
                titulo: { type: "string", description: "Título ou nome da lista identificado no texto" },
                questoes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      numero: { type: "number" },
                      enunciado: { type: "string" },
                      alternativas: { type: "array", items: { type: "string" } },
                      tipo: { type: "string", enum: ["multipla_escolha", "dissertativa"] }
                    },
                    required: ["numero", "enunciado", "tipo"],
                    additionalProperties: false
                  }
                }
              },
              required: ["titulo", "questoes"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extrair_questoes" } },
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
    let resultado = { titulo: "Lista de Exercícios", questoes: [] as any[] };

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      resultado = JSON.parse(toolCall.function.arguments);
    }

    if (!resultado.questoes || resultado.questoes.length === 0) {
      return new Response(JSON.stringify({ error: "Não foi possível extrair questões do PDF" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save to database
    const { data: listaData, error: insertError } = await supabase
      .from("listas_exercicios")
      .insert({
        materia_id: materiaId,
        titulo: resultado.titulo || "Lista de Exercícios",
        questoes: resultado.questoes,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ listaId: listaData.id, titulo: resultado.titulo, questoesCount: resultado.questoes.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extrair-lista error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
