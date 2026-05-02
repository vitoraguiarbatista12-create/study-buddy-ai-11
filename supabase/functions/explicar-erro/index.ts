import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { pergunta, alternativas, respostaUsuario, respostaCorreta } = await req.json();
    if (!pergunta) return new Response(JSON.stringify({ error: "Missing pergunta" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const errou = respostaUsuario && respostaUsuario !== respostaCorreta;
    const naoRespondeu = !respostaUsuario || respostaUsuario === "__timeout__";

    const prompt = `Um aluno ${naoRespondeu ? "não respondeu a tempo" : `respondeu "${respostaUsuario}" mas a resposta correta é "${respostaCorreta}"`} na seguinte questão:

Pergunta: ${pergunta}
${alternativas?.length ? `Alternativas:\n${alternativas.join("\n")}` : ""}

Explique em português de forma didática e clara:
1. Por que "${respostaCorreta}" é a resposta correta
2. ${errou ? `Por que "${respostaUsuario}" está errada` : "O conceito principal que a questão testa"}
3. Um exemplo prático ou forma de memorizar o conceito

Seja conciso (máx 3 parágrafos), direto ao ponto e use linguagem acessível.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 600,
      }),
    });

    if (!response.ok) throw new Error(`Groq error: ${response.status}`);
    const aiData = await response.json();
    const explicacao = aiData.choices?.[0]?.message?.content || "Não foi possível gerar a explicação.";

    return new Response(JSON.stringify({ explicacao }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("explicar-erro error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
