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
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um assistente que extrai questões de listas de exercícios a partir de texto de PDFs acadêmicos.
Analise o texto e identifique cada questão individualmente.

Responda APENAS com um JSON válido, sem texto antes ou depois, sem blocos de markdown:
{
  "titulo": "Título ou nome da lista identificado no texto",
  "questoes": [
    {
      "numero": 1,
      "enunciado": "texto completo da questão",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "tipo": "multipla_escolha"
    },
    {
      "numero": 2,
      "enunciado": "texto completo da questão dissertativa",
      "alternativas": [],
      "tipo": "dissertativa"
    }
  ]
}

Ignore imagens, gráficos ou referências visuais que não podem ser interpretadas como texto.`;

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
          { role: "user", content: `Extraia as questões desta lista de exercícios:\n\n${texto.substring(0, 15000)}` },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq error:", response.status, errText);
      throw new Error(`Groq error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text
      || aiData.choices?.[0]?.message?.content
      || "";

    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let resultado = { titulo: "Lista de Exercícios", questoes: [] as any[] };
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      resultado = JSON.parse(jsonMatch[0]);
    }

    if (!resultado.questoes || resultado.questoes.length === 0) {
      return new Response(JSON.stringify({ error: "Não foi possível extrair questões do PDF" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
