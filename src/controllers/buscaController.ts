import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
    LIMITE_ADERENCIA_BASICO,
    calcularScoreCompatibilidade,
    desmapearEstagioInvestidor,
    desmapearEstagioStartup,
    mapearEstagioInvestidor,
    mapearEstagioStartup
} from '../utils/compatibilidade';

const prisma = new PrismaClient();

export const listarLocais = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const usuario = await prisma.usuario.findUnique({ where: { id_usuario: req.usuarioId } });
        if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });

        if (usuario.tipo_usuario === 'investidor') {
            const startups = await prisma.startup.findMany({ select: { cidade: true } });
            const cidades = [...new Set(startups.map((s) => s.cidade).filter((c): c is string => Boolean(c)))].sort();
            return res.json(cidades);
        } else {
            const investidores = await prisma.investidor.findMany({ select: { cidade: true } });
            const cidades = [...new Set(investidores.map((i) => i.cidade).filter((c): c is string => Boolean(c)))].sort();
            return res.json(cidades);
        }
    } catch (error) {
        console.error('Erro ao listar locais:', error);
        res.status(500).json({ error: 'Erro ao listar localizações' });
    }
};

export const buscarPerfis = async (req: AuthRequest, res: Response) => {
    try {
        const usuarioId = req.usuarioId;
        if (!usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const usuarioLogado = await prisma.usuario.findUnique({
            where: { id_usuario: usuarioId },
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
        const { texto, segmento, localizacao, estagio } = req.body as {
            texto?: string;
            segmento?: string;
            localizacao?: string;
            estagio?: string;
        };

        // No plano básico, os filtros avançados são ignorados no servidor
        const filtroSegmento = ehPremium ? segmento : undefined;
        const filtroLocalizacao = ehPremium ? localizacao : undefined;
        const filtroEstagio = ehPremium ? estagio : undefined;

        let resultados: unknown[] = [];

        if (usuarioLogado.tipo_usuario === 'investidor' && usuarioLogado.investidor) {
            const inv = usuarioLogado.investidor;
            const meusSegmentos = inv.investidor_segmento.map((s) => s.segmento.nome);
            const meusEstagiosBanco = inv.investidor_estagio.map((e) => e.estagio);

            const matchesExistentes = await prisma.match_conexao.findMany({
                where: { id_investidor: inv.id_investidor, status: 'ativo' },
                select: { id_startup: true }
            });
            const startupsComMatch = new Set(matchesExistentes.map((m) => m.id_startup));

            const startups = await prisma.startup.findMany({
                where: {
                    ...(filtroLocalizacao ? { cidade: filtroLocalizacao } : {}),
                    ...(filtroEstagio ? { estagio: mapearEstagioStartup(filtroEstagio) } : {}),
                    ...(filtroSegmento
                        ? { startup_segmento: { some: { segmento: { nome: filtroSegmento } } } }
                        : {}),
                    ...(texto
                        ? {
                              OR: [
                                  { nome_fantasia: { contains: texto } },
                                  { descricao: { contains: texto } },
                                  { usuario: { nome: { contains: texto } } }
                              ]
                          }
                        : {})
                },
                include: {
                    usuario: true,
                    startup_segmento: { include: { segmento: true } }
                }
            });

            const mapeadas = startups.map((s) => {
                const segPrincipal = s.startup_segmento.find((ss) => ss.principal) || s.startup_segmento[0];
                const nomeSegmento = segPrincipal ? segPrincipal.segmento.nome : 'Outro';

                const score = calcularScoreCompatibilidade(
                    {
                        cidade: s.cidade,
                        estagio: s.estagio,
                        investimento_pretendido: s.investimento_pretendido,
                        segmentoNome: nomeSegmento
                    },
                    {
                        cidade: inv.cidade,
                        faixa_minima: inv.faixa_minima,
                        faixa_maxima: inv.faixa_maxima,
                        segmentosInteresse: meusSegmentos,
                        estagiosPreferidosBanco: meusEstagiosBanco
                    }
                );

                const jaTemMatch = startupsComMatch.has(s.id_startup);
                const bloqueadoPlano = !ehPremium && score > LIMITE_ADERENCIA_BASICO && !jaTemMatch;

                if (bloqueadoPlano) {
                    return {
                        id: s.id_usuario,
                        nome: 'Startup Compatível',
                        email: '',
                        papel: 'startup',
                        foto: undefined,
                        localizacao: s.cidade || 'Não informada',
                        descricao: 'Assine o plano Premium para desbloquear o nome, materiais de pitch e detalhes desta startup.',
                        segmento: nomeSegmento,
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
                    segmento: nomeSegmento,
                    estagio: desmapearEstagioStartup(s.estagio),
                    valorInvestimento: Number(s.investimento_pretendido),
                    participacaoOferecida: Number(s.participacao_oferecida),
                    score,
                    bloqueadoPlano: false
                };
            });

            resultados = mapeadas.sort((a, b) => b.score - a.score);
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
                where: {
                    ...(filtroLocalizacao ? { cidade: filtroLocalizacao } : {}),
                    ...(filtroSegmento
                        ? { investidor_segmento: { some: { segmento: { nome: filtroSegmento } } } }
                        : {}),
                    ...(filtroEstagio
                        ? { investidor_estagio: { some: { estagio: mapearEstagioInvestidor(filtroEstagio) } } }
                        : {}),
                    ...(texto
                        ? {
                              OR: [
                                  { tese_investimento: { contains: texto } },
                                  { usuario: { nome: { contains: texto } } }
                              ]
                          }
                        : {})
                },
                include: {
                    usuario: true,
                    investidor_segmento: { include: { segmento: true } },
                    investidor_estagio: true
                }
            });

            const mapeados = investidores.map((i) => {
                const segmentosDoInvestidor = i.investidor_segmento.map((s) => s.segmento.nome);
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
                        segmentosInteresse: segmentosDoInvestidor,
                        estagiosPreferidosBanco: estagiosBanco
                    }
                );

                const jaTemMatch = investidoresComMatch.has(i.id_investidor);
                const bloqueadoPlano = !ehPremium && score > LIMITE_ADERENCIA_BASICO && !jaTemMatch;

                if (bloqueadoPlano) {
                    return {
                        id: i.id_usuario,
                        nome: 'Investidor Compatível',
                        email: '',
                        papel: 'investidor',
                        foto: undefined,
                        localizacao: i.cidade || 'Não informada',
                        tese: 'Assine o plano Premium para desbloquear a identidade e a tese completa deste investidor.',
                        investimentoMinimo: Number(i.faixa_minima),
                        investimentoMaximo: Number(i.faixa_maxima),
                        segmentosInteresse: segmentosDoInvestidor,
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
                    segmentosInteresse: segmentosDoInvestidor,
                    estagiosPreferidos: estagiosBanco.map((e) => desmapearEstagioInvestidor(e)),
                    score,
                    bloqueadoPlano: false
                };
            });

            resultados = mapeados.sort((a, b) => b.score - a.score);
        }

        res.json(resultados);
    } catch (error) {
        console.error('Erro na busca:', error);
        res.status(500).json({ error: 'Erro ao buscar perfis' });
    }
};

export const buscarPerfilPorId = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const id = req.params.id as string;

        const [usuarioLogado, usuarioAlvo] = await Promise.all([
            prisma.usuario.findUnique({
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
            }),
            prisma.usuario.findUnique({
                where: { id_usuario: id },
                include: {
                    startup: { include: { startup_segmento: { include: { segmento: true } } } },
                    investidor: {
                        include: {
                            investidor_segmento: { include: { segmento: true } },
                            investidor_estagio: true
                        }
                    }
                }
            })
        ]);

        if (!usuarioLogado || !usuarioAlvo) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        let scoreCalculado: number | undefined;
        const ehProprioPerfil = usuarioLogado.id_usuario === usuarioAlvo.id_usuario;

        if (!ehProprioPerfil && usuarioLogado.tipo_usuario !== usuarioAlvo.tipo_usuario) {
            const st = usuarioLogado.tipo_usuario === 'startup' ? usuarioLogado.startup : usuarioAlvo.startup;
            const inv = usuarioLogado.tipo_usuario === 'investidor' ? usuarioLogado.investidor : usuarioAlvo.investidor;

            if (st && inv) {
                const segPrincipal = st.startup_segmento.find((ss) => ss.principal) || st.startup_segmento[0];
                scoreCalculado = calcularScoreCompatibilidade(
                    {
                        cidade: st.cidade,
                        estagio: st.estagio,
                        investimento_pretendido: st.investimento_pretendido,
                        segmentoNome: segPrincipal ? segPrincipal.segmento.nome : 'Outro'
                    },
                    {
                        cidade: inv.cidade,
                        faixa_minima: inv.faixa_minima,
                        faixa_maxima: inv.faixa_maxima,
                        segmentosInteresse: inv.investidor_segmento.map((s) => s.segmento.nome),
                        estagiosPreferidosBanco: inv.investidor_estagio.map((e) => e.estagio)
                    }
                );

                if (usuarioLogado.plano !== 'premium' && scoreCalculado > LIMITE_ADERENCIA_BASICO) {
                    const matchExistente = await prisma.match_conexao.findFirst({
                        where: {
                            id_startup: st.id_startup,
                            id_investidor: inv.id_investidor,
                            status: 'ativo'
                        }
                    });

                    if (!matchExistente) {
                        return res.status(403).json({
                            error: 'Este perfil possui mais de 40% de aderência e é exclusivo para assinantes do plano Premium.',
                            codigo: 'PLANO_RESTRITO',
                            score: scoreCalculado
                        });
                    }
                }
            }
        }

        const perfilFormatado: Record<string, unknown> = {
            id: usuarioAlvo.id_usuario,
            nome: usuarioAlvo.nome,
            email: usuarioAlvo.email,
            papel: usuarioAlvo.tipo_usuario,
            foto: usuarioAlvo.foto_url || undefined,
            ...(scoreCalculado !== undefined ? { score: scoreCalculado } : {})
        };

        if (usuarioAlvo.tipo_usuario === 'startup' && usuarioAlvo.startup) {
            const s = usuarioAlvo.startup;
            const segPrincipal = s.startup_segmento.find((ss) => ss.principal) || s.startup_segmento[0];

            Object.assign(perfilFormatado, {
                localizacao: s.cidade || '',
                descricao: s.descricao || '',
                segmento: segPrincipal ? segPrincipal.segmento.nome : 'Outro',
                estagio: desmapearEstagioStartup(s.estagio),
                composicaoEquipe: s.composicao_equipe || '',
                mercado: s.mercado || '',
                modeloNegocio: s.modelo_negocio || '',
                valorInvestimento: Number(s.investimento_pretendido),
                participacaoOferecida: Number(s.participacao_oferecida),
                video_pitch_url: s.video_pitch_url,
                documento_canvas_url: s.documento_canvas_url
            });
        } else if (usuarioAlvo.tipo_usuario === 'investidor' && usuarioAlvo.investidor) {
            const i = usuarioAlvo.investidor;

            Object.assign(perfilFormatado, {
                localizacao: i.cidade || '',
                tese: i.tese_investimento || '',
                investimentoMinimo: Number(i.faixa_minima),
                investimentoMaximo: Number(i.faixa_maxima),
                segmentosInteresse: i.investidor_segmento.map((s) => s.segmento.nome),
                estagiosPreferidos: i.investidor_estagio.map((e) => desmapearEstagioInvestidor(e.estagio))
            });
        }

        res.json(perfilFormatado);
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        res.status(500).json({ error: 'Erro ao buscar perfil detalhado' });
    }
};