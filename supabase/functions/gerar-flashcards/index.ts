import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { texto, nomeMateria } = await req.json();
    if (!texto) return new Response(JSON.stringify({ error: "Missing texto" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const systemPrompt = `Você é um especialista em criar flashcards para estudo.
Crie exatamente 15 flashcards baseados no conteúdo fornecido.

REGRAS:
- Foque em conceitos, definições, fórmulas e relações importantes do CONTEÚDO
- IGNORE objetivos do curso, carga horária, critérios de avaliação, informações administrativas
- A frente deve ser uma pergunta ou termo curto e direto
- O verso deve ser a resposta completa mas concisa (1-3 frases)
- Os flashcards devem cobrir os tópicos mais importantes e prováveis de cair em prova

Responda APENAS com JSON válido, sem texto antes ou depois:
{
  "flashcards": [
    { "frente": "O que é X?", "verso": "X é..." },
    { "frente": "Como funciona Y?", "verso": "Y funciona através de..." }
  ]
}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Crie flashcards para a matéria "${nomeMateria || "esta disciplina"}":\n\n${texto.substring(0, 15000)}` },
        ],
        temperature: 0.4,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) throw new Error(`Groq error: ${response.status}`);
    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let result = { flashcards: [] };
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) result = JSON.parse(match[0]);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("gerar-flashcards error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
