import { Router } from 'express';
import { register, login } from '../controllers/authController';
import { obterDashboard, obterDetalhesDashboard } from '../controllers/dashboardController';
import {
    criarInteresse,
    interessesPendentes,
    aceitarMatch,
    listarMatches,
    interessesEnviados,
    recusarInteresse
} from '../controllers/matchController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { enviarMensagem, listarMensagens } from '../controllers/mensagemController';
import { atualizarPerfil, atualizarPlano } from '../controllers/perfilController';
import { obterRecomendacoes } from '../controllers/recomendacaoController';
import { buscarPerfis, buscarPerfilPorId, listarLocais } from '../controllers/buscaController';

const router = Router();

// Rotas Públicas
router.post('/auth/register', register);
router.post('/auth/login', login);

// Rotas Privadas
router.get('/locais', authMiddleware, listarLocais);
router.post('/buscar', authMiddleware, buscarPerfis);
router.get('/dashboard', authMiddleware, obterDashboard);
router.get('/dashboard/detalhes', authMiddleware, obterDetalhesDashboard);
router.put('/perfil', authMiddleware, atualizarPerfil);
router.patch('/perfil/plano', authMiddleware, atualizarPlano);
router.get('/perfil/:id', authMiddleware, buscarPerfilPorId);

// Rotas de Matchmaking
router.post('/match/interesse', authMiddleware, criarInteresse);
router.get('/match/pendentes', authMiddleware, interessesPendentes);
router.post('/match/aceitar', authMiddleware, aceitarMatch);
router.get('/match/listar', authMiddleware, listarMatches);
router.get('/match/enviados', authMiddleware, interessesEnviados);
router.get('/recomendacoes', authMiddleware, obterRecomendacoes);
router.post('/match/recusar', authMiddleware, recusarInteresse);

// Rotas de Mensagens
router.post('/mensagens', authMiddleware, enviarMensagem);
router.get('/mensagens/:matchId', authMiddleware, listarMensagens);

export default router;