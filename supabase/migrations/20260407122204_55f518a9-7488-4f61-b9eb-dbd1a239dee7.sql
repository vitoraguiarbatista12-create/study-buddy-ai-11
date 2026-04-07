
CREATE TABLE public.listas_exercicios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  materia_id UUID NOT NULL REFERENCES public.materias(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL DEFAULT 'Lista de Exercícios',
  questoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.listas_exercicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own listas"
ON public.listas_exercicios
FOR ALL
TO public
USING (EXISTS (
  SELECT 1 FROM materias WHERE materias.id = listas_exercicios.materia_id AND materias.user_id = auth.uid()
));
