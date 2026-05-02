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

    const systemPrompt = `Você é um professor especialista em criar resumos de estudo claros e objetivos.
Seu trabalho é transformar o conteúdo fornecido em um resumo estruturado para ajudar o aluno a estudar para provas.

REGRAS:
- Foque 100% no CONTEÚDO da disciplina — conceitos, teorias, fórmulas, processos
- IGNORE completamente: objetivos do curso, carga horária, critérios de avaliação, nome da instituição, bibliografia
- Use markdown para formatar
- Organize em seções temáticas com títulos
- Use bullet points para os pontos principais
- Destaque termos importantes em **negrito**
- Inclua uma seção "⚡ Pontos-Chave para a Prova" ao final com os 5-7 conceitos mais importantes
- Seja conciso mas completo — o aluno deve conseguir revisar em 5 minutos`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Crie um resumo de estudo para a matéria "${nomeMateria || "esta disciplina"}" baseado no seguinte conteúdo:\n\n${texto.substring(0, 15000)}` },
        ],
        temperature: 0.4,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq error: ${response.status} — ${errText}`);
    }

    const aiData = await response.json();
    const resumo = aiData.choices?.[0]?.message?.content || "Não foi possível gerar o resumo.";

    return new Response(JSON.stringify({ resumo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("resumir-conteudo error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
