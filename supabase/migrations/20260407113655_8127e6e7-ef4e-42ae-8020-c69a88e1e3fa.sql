
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Materias table
CREATE TABLE public.materias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.materias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own materias" ON public.materias FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own materias" ON public.materias FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own materias" ON public.materias FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own materias" ON public.materias FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_materias_updated_at BEFORE UPDATE ON public.materias
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Metas de estudo
CREATE TABLE public.metas_estudo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nota_desejada NUMERIC(3,1) NOT NULL CHECK (nota_desejada >= 0 AND nota_desejada <= 10),
  materia_id UUID NOT NULL REFERENCES public.materias(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.metas_estudo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own metas" ON public.metas_estudo FOR ALL
USING (EXISTS (SELECT 1 FROM public.materias WHERE materias.id = metas_estudo.materia_id AND materias.user_id = auth.uid()));

-- Documentos
CREATE TABLE public.documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo TEXT NOT NULL,
  texto_extraido TEXT,
  materia_id UUID NOT NULL REFERENCES public.materias(id) ON DELETE CASCADE,
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own documentos" ON public.documentos FOR ALL
USING (EXISTS (SELECT 1 FROM public.materias WHERE materias.id = documentos.materia_id AND materias.user_id = auth.uid()));

-- Questoes
CREATE TABLE public.questoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pergunta TEXT NOT NULL,
  alternativas JSONB NOT NULL DEFAULT '[]'::jsonb,
  resposta_correta TEXT NOT NULL,
  materia_id UUID NOT NULL REFERENCES public.materias(id) ON DELETE CASCADE,
  resultado_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.questoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own questoes" ON public.questoes FOR ALL
USING (EXISTS (SELECT 1 FROM public.materias WHERE materias.id = questoes.materia_id AND materias.user_id = auth.uid()));

-- Resultados
CREATE TABLE public.resultados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acertos INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0,
  nota_estimada NUMERIC(3,1) NOT NULL DEFAULT 0,
  feedback TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  materia_id UUID NOT NULL REFERENCES public.materias(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.resultados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own resultados" ON public.resultados FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own resultados" ON public.resultados FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add FK from questoes to resultados
ALTER TABLE public.questoes ADD CONSTRAINT questoes_resultado_id_fkey
FOREIGN KEY (resultado_id) REFERENCES public.resultados(id) ON DELETE SET NULL;

-- Storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('pdfs', 'pdfs', false);

CREATE POLICY "Users can upload PDFs" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own PDFs" ON storage.objects FOR SELECT
USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own PDFs" ON storage.objects FOR DELETE
USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
