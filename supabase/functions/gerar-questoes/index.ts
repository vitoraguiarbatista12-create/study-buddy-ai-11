import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texto, notaDesejada, materiaId, qtdQuestoes } = await req.json();

    if (!texto || !materiaId) {
      return new Response(JSON.stringify({ error: "Missing texto or materiaId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    // Quantidade: usa o valor enviado, com limites de segurança (5–20).
    // Se não enviado, usa 10 como padrão (comportamento original estável).
    const quantidade = qtdQuestoes
        ? Math.min(Math.max(Number(qtdQuestoes), 5), 20)
        : 10;

    // O prompt sempre pede um múltiplo de segurança a mais (ex: pede 15 para entregar 10).
    // Isso garante que mesmo que o modelo gere menos, o slice final cobre a quantidade pedida.
    // IMPORTANTE: não mencionar o número exato no prompt evita que o modelo tente contar
    // e quebre o JSON no meio. Em vez disso, peço "pelo menos N" e controlo no slice.
    const quantidadePedida = Math.min(quantidade + 5, 25);

    const systemPrompt = `Você é um professor especialista que gera questões de prova sobre o CONTEÚDO da disciplina.

Nível de dificuldade: ${dificuldade} (nota desejada: ${nota}/10)

REGRAS OBRIGATÓRIAS:
- Gere pelo menos ${quantidadePedida} questões de múltipla escolha
- Cada questão deve ter exatamente 4 alternativas (A, B, C, D)
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
        // max_tokens proporcional à quantidade pedida: ~350 tokens por questão é seguro
        max_tokens: Math.min(quantidadePedida * 350, 8192),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq error:", response.status, errText);
      throw new Error(`Groq error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Limpeza robusta: remove markdown fences e qualquer texto fora do array JSON
    const cleaned = content
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

    let questoes: any[] = [];
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        questoes = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.error("JSON parse error:", parseErr);
        // Tentativa de recuperação: extrai objetos individuais válidos do array parcial
        const objetosMatch = jsonMatch[0].match(/\{[\s\S]*?"resposta"[\s\S]*?\}/g);
        if (objetosMatch) {
          for (const obj of objetosMatch) {
            try {
              questoes.push(JSON.parse(obj));
            } catch {
              // ignora objetos malformados individualmente
            }
          }
        }
      }
    }

    // Filtra questões inválidas (sem os campos obrigatórios ou alternativas insuficientes)
    questoes = questoes.filter(
        (q) =>
            q?.pergunta &&
            Array.isArray(q?.alternativas) &&
            q.alternativas.length >= 4 &&
            q?.resposta
    );

    if (questoes.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to generate questions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Garante que não ultrapassa a quantidade solicitada
    const questoesFinal = questoes.slice(0, quantidade);

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

    const questoesInsert = questoesFinal.map((q: any) => ({
      pergunta: q.pergunta,
      alternativas: q.alternativas,
      resposta_correta: q.resposta,
      materia_id: materiaId,
      resultado_id: resultadoId,
    }));

    const { error: insertError } = await supabase.from("questoes").insert(questoesInsert);
    if (insertError) throw insertError;

    return new Response(
        JSON.stringify({ resultadoId, questoesCount: questoesInsert.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("gerar-questoes error:", e);
    return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
    );
  }
});