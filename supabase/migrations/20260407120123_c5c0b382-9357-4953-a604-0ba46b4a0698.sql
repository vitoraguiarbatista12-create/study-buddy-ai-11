ALTER TABLE public.questoes ADD COLUMN resposta_usuario text;

CREATE POLICY "Users can delete own resultados" ON public.resultados FOR DELETE TO public USING (auth.uid() = user_id);

CREATE POLICY "Users can update own questoes" ON public.questoes FOR UPDATE TO public USING (EXISTS (SELECT 1 FROM materias WHERE materias.id = questoes.materia_id AND materias.user_id = auth.uid()));