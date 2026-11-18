import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import { randomUUID } from 'crypto';
import {
    LIMITE_ADERENCIA_BASICO,
    LIMITE_MATCHES_BASICO,
    calcularScoreCompatibilidade,
    desmapearEstagioStartup
} from '../utils/compatibilidade';

const prisma = new PrismaClient();

async function contarMatchesAtivosUsuario(tipo: string, idRelacional: string): Promise<number> {
    return prisma.match_conexao.count({
        where:
            tipo === 'startup'
                ? { id_startup: idRelacional, status: 'ativo' }
                : { id_investidor: idRelacional, status: 'ativo' }
    });
}

async function garantirMatchEConversa(id_startup: string, id_investidor: string, score?: number) {
    let matchExistente = await prisma.match_conexao.findFirst({
        where: { id_startup, id_investidor }
    });

    if (matchExistente) {
        const conversaExistente = await prisma.conversa.findFirst({
            where: { id_match: matchExistente.id_match }
        });

        if (!conversaExistente) {
            await prisma.conversa.create({
                data: {
                    id_conversa: randomUUID(),
                    match_conexao: { connect: { id_match: matchExistente.id_match } }
                }
            });
        }
        return matchExistente;
    }

    const novoMatchId = randomUUID();
    const novoMatch = await prisma.match_conexao.create({
        data: {
            id_match: novoMatchId,
            id_startup,
            id_investidor,
            ...(score !== undefined ? { score_compatibilidade: score } : {})
        }
    });

    await prisma.conversa.create({
        data: {
            id_conversa: randomUUID(),
            match_conexao: { connect: { id_match: novoMatchId } }
        }
    });

    return novoMatch;
}

export const criarInteresse = async (req: AuthRequest, res: Response) => {
    try {
        let { id_startup, id_investidor, iniciado_por, mensagem } = req.body;

        if (!req.usuarioId) {
            return res.status(401).json({ error: 'Não autorizado' });
        }

        const usuarioLogado = await prisma.usuario.findUnique({
            where: { id_usuario: req.usuarioId },
            include: { startup: true, investidor: true }
        });

        if (!usuarioLogado) return res.status(404).json({ error: 'Usuário não encontrado' });

        const startupAlvo =
            (await prisma.startup.findUnique({
                where: { id_usuario: id_startup },
                include: { startup_segmento: { include: { segmento: true } } }
            })) ||
            (await prisma.startup.findUnique({
                where: { id_startup },
                include: { startup_segmento: { include: { segmento: true } } }
            }));

        const investidorAlvo =
            (await prisma.investidor.findUnique({
                where: { id_usuario: id_investidor },
                include: {
                    investidor_segmento: { include: { segmento: true } },
                    investidor_estagio: true
                }
            })) ||
            (await prisma.investidor.findUnique({
                where: { id_investidor },
                include: {
                    investidor_segmento: { include: { segmento: true } },
                    investidor_estagio: true
                }
            }));

        if (!startupAlvo || !investidorAlvo) {
            return res.status(404).json({ error: 'Perfis de conexão não encontrados.' });
        }

        id_startup = startupAlvo.id_startup;
        id_investidor = investidorAlvo.id_investidor;

        const segPrincipal =
            startupAlvo.startup_segmento.find((ss) => ss.principal) || startupAlvo.startup_segmento[0];
        const score = calcularScoreCompatibilidade(
            {
                cidade: startupAlvo.cidade,
                estagio: startupAlvo.estagio,
                investimento_pretendido: startupAlvo.investimento_pretendido,
                segmentoNome: segPrincipal ? segPrincipal.segmento.nome : 'Outro'
            },
            {
                cidade: investidorAlvo.cidade,
                faixa_minima: investidorAlvo.faixa_minima,
                faixa_maxima: investidorAlvo.faixa_maxima,
                segmentosInteresse: investidorAlvo.investidor_segmento.map((s) => s.segmento.nome),
                estagiosPreferidosBanco: investidorAlvo.investidor_estagio.map((e) => e.estagio)
            }
        );

        // Regras do plano Gratuito (basico)
        if (usuarioLogado.plano !== 'premium') {
            if (score > LIMITE_ADERENCIA_BASICO) {
                return res.status(403).json({
                    error: 'Perfis com mais de 40% de aderência são exclusivos do plano Premium.',
                    codigo: 'PLANO_RESTRITO'
                });
            }

            const meuIdRel =
                usuarioLogado.tipo_usuario === 'startup' ? id_startup : id_investidor;
            const totalMatches = await contarMatchesAtivosUsuario(usuarioLogado.tipo_usuario, meuIdRel);

            if (totalMatches >= LIMITE_MATCHES_BASICO) {
                return res.status(403).json({
                    error: 'Você atingiu o limite de 3 matches do plano Gratuito. Assine o Premium para conexões ilimitadas!',
                    codigo: 'LIMITE_MATCHES'
                });
            }
        }

        // Verifica se a outra parte já demonstrou interesse previamente (match imediato)
        const interesseExistente = await prisma.interesse.findUnique({
            where: { id_startup_id_investidor: { id_startup, id_investidor } }
        });

        if (interesseExistente) {
            if (
                interesseExistente.status === 'pendente' &&
                interesseExistente.iniciado_por !== usuarioLogado.tipo_usuario
            ) {
                await prisma.interesse.update({
                    where: { id_interesse: interesseExistente.id_interesse },
                    data: { status: 'aceito' }
                });
                const matchCriado = await garantirMatchEConversa(id_startup, id_investidor, score);
                return res.status(201).json({
                    message: 'Match realizado com sucesso!',
                    match: {
                        id: matchCriado.id_match,
                        usuarios: [startupAlvo.id_usuario, investidorAlvo.id_usuario],
                        criadoEm: (matchCriado.data_match || new Date()).toISOString()
                    }
                });
            }
            return res.status(400).json({ error: 'Interesse já registrado anteriormente.' });
        }

        const novoInteresse = await prisma.interesse.create({
            data: {
                id_interesse: randomUUID(),
                id_startup,
                id_investidor,
                iniciado_por: (iniciado_por || usuarioLogado.tipo_usuario) as any,
                mensagem: mensagem || 'Interesse demonstrado na plataforma.'
            }
        });

        res.status(201).json({ message: 'Interesse enviado!', interesse: novoInteresse });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Interesse já registrado anteriormente.' });
        }
        console.error('Erro ao criar interesse:', error);
        res.status(500).json({ error: 'Erro interno ao processar interesse.' });
    }
};

export const interessesPendentes = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const usuarioLogado = await prisma.usuario.findUnique({
            where: { id_usuario: req.usuarioId },
            include: { startup: true, investidor: true }
        });

        if (!usuarioLogado) return res.status(404).json({ error: 'Usuário não encontrado' });

        if (usuarioLogado.tipo_usuario === 'startup' && usuarioLogado.startup) {
            const pendentesRaw = await prisma.interesse.findMany({
                where: {
                    id_startup: usuarioLogado.startup.id_startup,
                    iniciado_por: 'investidor',
                    status: 'pendente'
                },
                include: {
                    investidor: { include: { usuario: true } }
                }
            });

            const perfis = pendentesRaw.map((p) => ({
                id: p.investidor.id_usuario,
                nome: p.investidor.usuario.nome,
                email: p.investidor.usuario.email,
                papel: 'investidor',
                foto: p.investidor.usuario.foto_url || undefined,
                localizacao: p.investidor.cidade || '',
                tese: p.investidor.tese_investimento || '',
                investimentoMinimo: Number(p.investidor.faixa_minima),
                investimentoMaximo: Number(p.investidor.faixa_maxima),
                segmentosInteresse: ['Outro'],
                estagiosPreferidos: []
            }));
            return res.json(perfis);
        } else if (usuarioLogado.tipo_usuario === 'investidor' && usuarioLogado.investidor) {
            const pendentesRaw = await prisma.interesse.findMany({
                where: {
                    id_investidor: usuarioLogado.investidor.id_investidor,
                    iniciado_por: 'startup',
                    status: 'pendente'
                },
                include: {
                    startup: { include: { usuario: true, startup_segmento: { include: { segmento: true } } } }
                }
            });

            const perfis = pendentesRaw.map((p) => {
                const seg =
                    p.startup.startup_segmento.find((ss) => ss.principal) ||
                    p.startup.startup_segmento[0];
                return {
                    id: p.startup.id_usuario,
                    nome: p.startup.usuario.nome,
                    email: p.startup.usuario.email,
                    papel: 'startup',
                    foto: p.startup.usuario.foto_url || undefined,
                    localizacao: p.startup.cidade || '',
                    descricao: p.startup.descricao || '',
                    segmento: seg ? seg.segmento.nome : 'Outro',
                    estagio: desmapearEstagioStartup(p.startup.estagio),
                    valorInvestimento: Number(p.startup.investimento_pretendido),
                    participacaoOferecida: Number(p.startup.participacao_oferecida)
                };
            });
            return res.json(perfis);
        }

        res.json([]);
    } catch (error) {
        console.error('Erro ao listar pendentes:', error);
        res.status(500).json({ error: 'Erro interno ao listar pendentes' });
    }
};

export const aceitarMatch = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const { alvoId } = req.body;

        const usuarioLogado = await prisma.usuario.findUnique({
            where: { id_usuario: req.usuarioId },
            include: { startup: true, investidor: true }
        });

        const usuarioAlvo = await prisma.usuario.findUnique({
            where: { id_usuario: alvoId },
            include: { startup: true, investidor: true }
        });

        if (!usuarioLogado || !usuarioAlvo) return res.status(404).json({ error: 'Usuário inválido' });

        const id_startup =
            usuarioLogado.tipo_usuario === 'startup'
                ? usuarioLogado.startup?.id_startup
                : usuarioAlvo.startup?.id_startup;
        const id_investidor =
            usuarioLogado.tipo_usuario === 'investidor'
                ? usuarioLogado.investidor?.id_investidor
                : usuarioAlvo.investidor?.id_investidor;

        if (!id_startup || !id_investidor) {
            return res.status(400).json({ error: 'Erro de mapeamento de IDs' });
        }

        const matchJaExistia = await prisma.match_conexao.findFirst({
            where: { id_startup, id_investidor }
        });

        if (!matchJaExistia && usuarioLogado.plano !== 'premium') {
            const meuIdRel =
                usuarioLogado.tipo_usuario === 'startup' ? id_startup : id_investidor;
            const totalMatches = await contarMatchesAtivosUsuario(usuarioLogado.tipo_usuario, meuIdRel);

            if (totalMatches >= LIMITE_MATCHES_BASICO) {
                return res.status(403).json({
                    error: 'Você atingiu o limite de 3 matches do plano Gratuito. Faça upgrade para o Premium para aceitar novas conexões!',
                    codigo: 'LIMITE_MATCHES'
                });
            }
        }

        await prisma.interesse.updateMany({
            where: {
                id_startup,
                id_investidor,
                status: 'pendente'
            },
            data: { status: 'aceito' }
        });

        const matchFinal = await garantirMatchEConversa(id_startup, id_investidor);

        res.status(201).json({
            message: 'Match realizado com sucesso!',
            match: {
                id: matchFinal.id_match,
                usuarios: [usuarioLogado.id_usuario, usuarioAlvo.id_usuario],
                criadoEm: (matchFinal.data_match || new Date()).toISOString()
            }
        });
    } catch (error) {
        console.error('Erro ao aceitar match:', error);
        res.status(500).json({ error: 'Erro interno ao processar match' });
    }
};

export const listarMatches = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const usuarioLogado = await prisma.usuario.findUnique({
            where: { id_usuario: req.usuarioId },
            include: { startup: true, investidor: true }
        });

        if (!usuarioLogado) return res.status(404).json({ error: 'Usuário não encontrado' });

        if (usuarioLogado.tipo_usuario === 'startup' && usuarioLogado.startup) {
            const matchesRaw = await prisma.match_conexao.findMany({
                where: { id_startup: usuarioLogado.startup.id_startup },
                include: {
                    investidor: {
                        include: {
                            usuario: true,
                            investidor_segmento: { include: { segmento: true } }
                        }
                    }
                }
            });

            const formatado = matchesRaw.map((m) => {
                const segs = m.investidor.investidor_segmento.map((s) => s.segmento.nome);
                return {
                    match: {
                        id: m.id_match,
                        usuarios: [usuarioLogado.id_usuario, m.investidor.id_usuario],
                        criadoEm: (m.data_match || new Date()).toISOString()
                    },
                    outro: {
                        id: m.investidor.id_usuario,
                        nome: m.investidor.usuario.nome,
                        email: m.investidor.usuario.email,
                        papel: 'investidor',
                        foto: m.investidor.usuario.foto_url || undefined,
                        localizacao: m.investidor.cidade || '',
                        tese: m.investidor.tese_investimento || '',
                        investimentoMinimo: Number(m.investidor.faixa_minima),
                        investimentoMaximo: Number(m.investidor.faixa_maxima),
                        segmentosInteresse: segs.length ? segs : ['Outro'],
                        estagiosPreferidos: []
                    }
                };
            });
            return res.json(formatado);
        } else if (usuarioLogado.tipo_usuario === 'investidor' && usuarioLogado.investidor) {
            const matchesRaw = await prisma.match_conexao.findMany({
                where: { id_investidor: usuarioLogado.investidor.id_investidor },
                include: {
                    startup: {
                        include: {
                            usuario: true,
                            startup_segmento: { include: { segmento: true } }
                        }
                    }
                }
            });

            const formatado = matchesRaw.map((m) => {
                const seg =
                    m.startup.startup_segmento.find((ss) => ss.principal) ||
                    m.startup.startup_segmento[0];
                return {
                    match: {
                        id: m.id_match,
                        usuarios: [usuarioLogado.id_usuario, m.startup.id_usuario],
                        criadoEm: (m.data_match || new Date()).toISOString()
                    },
                    outro: {
                        id: m.startup.id_usuario,
                        nome: m.startup.usuario.nome,
                        email: m.startup.usuario.email,
                        papel: 'startup',
                        foto: m.startup.usuario.foto_url || undefined,
                        localizacao: m.startup.cidade || '',
                        descricao: m.startup.descricao || '',
                        segmento: seg ? seg.segmento.nome : 'Outro',
                        estagio: desmapearEstagioStartup(m.startup.estagio),
                        valorInvestimento: Number(m.startup.investimento_pretendido),
                        participacaoOferecida: Number(m.startup.participacao_oferecida)
                    }
                };
            });
            return res.json(formatado);
        }

        res.json([]);
    } catch (error) {
        console.error('Erro ao listar matches:', error);
        res.status(500).json({ error: 'Erro interno ao listar matches' });
    }
};

export const interessesEnviados = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const usuarioLogado = await prisma.usuario.findUnique({
            where: { id_usuario: req.usuarioId },
            include: { startup: true, investidor: true }
        });

        if (usuarioLogado?.tipo_usuario === 'startup' && usuarioLogado.startup) {
            const interesses = await prisma.interesse.findMany({
                where: { id_startup: usuarioLogado.startup.id_startup, iniciado_por: 'startup' },
                include: { investidor: true }
            });
            return res.json(interesses.map((i) => i.investidor.id_usuario));
        } else if (usuarioLogado?.tipo_usuario === 'investidor' && usuarioLogado.investidor) {
            const interesses = await prisma.interesse.findMany({
                where: { id_investidor: usuarioLogado.investidor.id_investidor, iniciado_por: 'investidor' },
                include: { startup: true }
            });
            return res.json(interesses.map((i) => i.startup.id_usuario));
        }

        res.json([]);
    } catch (error) {
        console.error('Erro ao buscar interesses enviados:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
};

export const recusarInteresse = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const { alvoId } = req.body;

        const usuarioLogado = await prisma.usuario.findUnique({
            where: { id_usuario: req.usuarioId },
            include: { startup: true, investidor: true }
        });

        const usuarioAlvo = await prisma.usuario.findUnique({
            where: { id_usuario: alvoId },
            include: { startup: true, investidor: true }
        });

        if (!usuarioLogado || !usuarioAlvo) return res.status(404).json({ error: 'Usuário inválido' });

        const id_startup =
            usuarioLogado.tipo_usuario === 'startup'
                ? usuarioLogado.startup?.id_startup
                : usuarioAlvo.startup?.id_startup;
        const id_investidor =
            usuarioLogado.tipo_usuario === 'investidor'
                ? usuarioLogado.investidor?.id_investidor
                : usuarioAlvo.investidor?.id_investidor;

        if (!id_startup || !id_investidor) {
            return res.status(400).json({ error: 'Erro de mapeamento de IDs' });
        }

        await prisma.interesse.updateMany({
            where: {
                id_startup,
                id_investidor,
                status: 'pendente'
            },
            data: { status: 'recusado' }
        });

        res.status(200).json({ message: 'Interesse recusado.' });
    } catch (error) {
        console.error('Erro ao recusar interesse:', error);
        res.status(500).json({ error: 'Erro interno ao recusar interesse' });
    }
};