import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import CadastroPage from "./pages/CadastroPage";
import DashboardPage from "./pages/DashboardPage";
import MateriaPage from "./pages/MateriaPage";
import QuizPage from "./pages/QuizPage";
import ResultadoPage from "./pages/ResultadoPage";
import RevisaoPage from "./pages/RevisaoPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/cadastro" element={<CadastroPage />} />
            <Route
              path="/dashboard"
              element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
            />
            <Route
              path="/materia/:id"
              element={<ProtectedRoute><MateriaPage /></ProtectedRoute>}
            />
            <Route
              path="/quiz/:resultadoId"
              element={<ProtectedRoute><QuizPage /></ProtectedRoute>}
            />
            <Route
              path="/resultado/:resultadoId"
              element={<ProtectedRoute><ResultadoPage /></ProtectedRoute>}
            />
            <Route
              path="/revisao/:resultadoId"
              element={<ProtectedRoute><RevisaoPage /></ProtectedRoute>}
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
