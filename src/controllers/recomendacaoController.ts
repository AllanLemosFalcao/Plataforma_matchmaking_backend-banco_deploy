import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
    LIMITE_ADERENCIA_BASICO,
    calcularScoreCompatibilidade,
    desmapearEstagioInvestidor,
    desmapearEstagioStartup
} from '../utils/compatibilidade';

const prisma = new PrismaClient();

export const obterRecomendacoes = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const usuarioLogado = await prisma.usuario.findUnique({
            where: { id_usuario: req.usuarioId },
            include: {
                startup: { include: { startup_segmento: { include: { segmento: true } } } },
                investidor: {
                    include: {
                        investidor_segmento: { include: { segmento: true } },
                        investidor_estagio: true
                    }
                }
            }
        });

        if (!usuarioLogado) return res.status(404).json({ error: 'Usuário não encontrado' });

        const ehPremium = usuarioLogado.plano === 'premium';
        let recomendacoes: unknown[] = [];

        if (usuarioLogado.tipo_usuario === 'investidor' && usuarioLogado.investidor) {
            const inv = usuarioLogado.investidor;
            const segmentosInteresse = inv.investidor_segmento.map((s) => s.segmento.nome);
            const estagiosBanco = inv.investidor_estagio.map((e) => e.estagio);

            const matchesExistentes = await prisma.match_conexao.findMany({
                where: { id_investidor: inv.id_investidor, status: 'ativo' },
                select: { id_startup: true }
            });
            const startupsComMatch = new Set(matchesExistentes.map((m) => m.id_startup));

            const startups = await prisma.startup.findMany({
                include: { usuario: true, startup_segmento: { include: { segmento: true } } }
            });

            const pontuadas = startups.map((s) => {
                const segPrincipal = s.startup_segmento.find((ss) => ss.principal) || s.startup_segmento[0];
                const segmentoNome = segPrincipal ? segPrincipal.segmento.nome : 'Outro';

                const score = calcularScoreCompatibilidade(
                    {
                        cidade: s.cidade,
                        estagio: s.estagio,
                        investimento_pretendido: s.investimento_pretendido,
                        segmentoNome
                    },
                    {
                        cidade: inv.cidade,
                        faixa_minima: inv.faixa_minima,
                        faixa_maxima: inv.faixa_maxima,
                        segmentosInteresse,
                        estagiosPreferidosBanco: estagiosBanco
                    }
                );

                const bloqueadoPlano =
                    !ehPremium && score > LIMITE_ADERENCIA_BASICO && !startupsComMatch.has(s.id_startup);

                if (bloqueadoPlano) {
                    return {
                        id: s.id_usuario,
                        nome: 'Startup Compatível',
                        email: '',
                        papel: 'startup',
                        foto: undefined,
                        localizacao: s.cidade || 'Não informada',
                        descricao: 'Exclusivo Premium',
                        segmento: segmentoNome,
                        estagio: desmapearEstagioStartup(s.estagio),
                        valorInvestimento: Number(s.investimento_pretendido),
                        participacaoOferecida: Number(s.participacao_oferecida),
                        score,
                        bloqueadoPlano: true
                    };
                }

                return {
                    id: s.id_usuario,
                    nome: s.usuario.nome,
                    email: s.usuario.email,
                    papel: 'startup',
                    foto: s.usuario.foto_url || undefined,
                    localizacao: s.cidade || '',
                    descricao: s.descricao || '',
                    segmento: segmentoNome,
                    estagio: desmapearEstagioStartup(s.estagio),
                    valorInvestimento: Number(s.investimento_pretendido),
                    participacaoOferecida: Number(s.participacao_oferecida),
                    score,
                    bloqueadoPlano: false
                };
            });

            recomendacoes = pontuadas.sort((a, b) => b.score - a.score).slice(0, 4);
        } else if (usuarioLogado.tipo_usuario === 'startup' && usuarioLogado.startup) {
            const st = usuarioLogado.startup;
            const segPrincipal = st.startup_segmento.find((ss) => ss.principal) || st.startup_segmento[0];
            const meuSegmento = segPrincipal ? segPrincipal.segmento.nome : '';

            const matchesExistentes = await prisma.match_conexao.findMany({
                where: { id_startup: st.id_startup, status: 'ativo' },
                select: { id_investidor: true }
            });
            const investidoresComMatch = new Set(matchesExistentes.map((m) => m.id_investidor));

            const investidores = await prisma.investidor.findMany({
                include: {
                    usuario: true,
                    investidor_segmento: { include: { segmento: true } },
                    investidor_estagio: true
                }
            });

            const pontuados = investidores.map((i) => {
                const segmentosInteresse = i.investidor_segmento.map((s) => s.segmento.nome);
                const estagiosBanco = i.investidor_estagio.map((e) => e.estagio);

                const score = calcularScoreCompatibilidade(
                    {
                        cidade: st.cidade,
                        estagio: st.estagio,
                        investimento_pretendido: st.investimento_pretendido,
                        segmentoNome: meuSegmento
                    },
                    {
                        cidade: i.cidade,
                        faixa_minima: i.faixa_minima,
                        faixa_maxima: i.faixa_maxima,
                        segmentosInteresse,
                        estagiosPreferidosBanco: estagiosBanco
                    }
                );

                const bloqueadoPlano =
                    !ehPremium && score > LIMITE_ADERENCIA_BASICO && !investidoresComMatch.has(i.id_investidor);

                if (bloqueadoPlano) {
                    return {
                        id: i.id_usuario,
                        nome: 'Investidor Compatível',
                        email: '',
                        papel: 'investidor',
                        foto: undefined,
                        localizacao: i.cidade || 'Não informada',
                        tese: 'Exclusivo Premium',
                        investimentoMinimo: Number(i.faixa_minima),
                        investimentoMaximo: Number(i.faixa_maxima),
                        segmentosInteresse,
                        estagiosPreferidos: estagiosBanco.map((e) => desmapearEstagioInvestidor(e)),
                        score,
                        bloqueadoPlano: true
                    };
                }

                return {
                    id: i.id_usuario,
                    nome: i.usuario.nome,
                    email: i.usuario.email,
                    papel: 'investidor',
                    foto: i.usuario.foto_url || undefined,
                    localizacao: i.cidade || '',
                    tese: i.tese_investimento || '',
                    investimentoMinimo: Number(i.faixa_minima),
                    investimentoMaximo: Number(i.faixa_maxima),
                    segmentosInteresse,
                    estagiosPreferidos: estagiosBanco.map((e) => desmapearEstagioInvestidor(e)),
                    score,
                    bloqueadoPlano: false
                };
            });

            recomendacoes = pontuados.sort((a, b) => b.score - a.score).slice(0, 4);
        }

        res.json(recomendacoes);
    } catch (error) {
        console.error('Erro nas recomendações:', error);
        res.status(500).json({ error: 'Erro ao buscar recomendações' });
    }
};