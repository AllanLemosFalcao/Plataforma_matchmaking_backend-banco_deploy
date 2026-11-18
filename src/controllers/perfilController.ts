import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import { randomUUID } from 'crypto';
import { mapearEstagioInvestidor, mapearEstagioStartup } from '../utils/compatibilidade';

const prisma = new PrismaClient();

export const atualizarPerfil = async (req: AuthRequest, res: Response) => {
    try {
        const usuarioId = req.usuarioId;
        if (!usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const dados = req.body;

        const usuarioAtualizado = await prisma.usuario.update({
            where: { id_usuario: usuarioId },
            data: {
                nome: dados.nome,
                foto_url: dados.foto || null
            }
        });

        if (usuarioAtualizado.tipo_usuario === 'startup') {
            const st = await prisma.startup.update({
                where: { id_usuario: usuarioId },
                data: {
                    cidade: dados.localizacao,
                    descricao: dados.descricao,
                    estagio: mapearEstagioStartup(dados.estagio),
                    composicao_equipe: dados.composicaoEquipe,
                    mercado: dados.mercado,
                    modelo_negocio: dados.modeloNegocio,
                    investimento_pretendido: dados.valorInvestimento,
                    participacao_oferecida: dados.participacaoOferecida,
                    video_pitch_url: dados.video_pitch_url || null,
                    documento_canvas_url: dados.documento_canvas_url || null
                }
            });

            if (dados.segmento) {
                await prisma.startup_segmento.deleteMany({
                    where: { id_startup: st.id_startup }
                });

                let seg = await prisma.segmento.findFirst({ where: { nome: dados.segmento } });
                if (!seg) {
                    seg = await prisma.segmento.create({
                        data: { id_segmento: randomUUID(), nome: dados.segmento }
                    });
                }

                await prisma.startup_segmento.create({
                    data: { id_startup: st.id_startup, id_segmento: seg.id_segmento, principal: true }
                });
            }
        } else if (usuarioAtualizado.tipo_usuario === 'investidor') {
            await prisma.investidor.update({
                where: { id_usuario: usuarioId },
                data: {
                    cidade: dados.localizacao,
                    tese_investimento: dados.tese,
                    faixa_minima: dados.investimentoMinimo,
                    faixa_maxima: dados.investimentoMaximo
                }
            });

            const inv = await prisma.investidor.findUnique({ where: { id_usuario: usuarioId } });

            if (inv) {
                await prisma.investidor_segmento.deleteMany({ where: { id_investidor: inv.id_investidor } });
                await prisma.investidor_estagio.deleteMany({ where: { id_investidor: inv.id_investidor } });

                for (const nomeSeg of (dados.segmentosInteresse || [])) {
                    let seg = await prisma.segmento.findFirst({ where: { nome: nomeSeg } });
                    if (!seg) seg = await txSeg(nomeSeg);
                    await prisma.investidor_segmento.create({
                        data: { id_investidor: inv.id_investidor, id_segmento: seg.id_segmento }
                    });
                }

                for (const est of (dados.estagiosPreferidos || [])) {
                    await prisma.investidor_estagio.create({
                        data: { id_investidor: inv.id_investidor, estagio: mapearEstagioInvestidor(est) }
                    });
                }
            }
        }

        return res.json({
            message: 'Perfil atualizado com sucesso',
            perfil: { ...dados, plano: usuarioAtualizado.plano || 'basico' }
        });
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar perfil' });
    }
};

async function txSeg(nome: string) {
    return prisma.segmento.create({
        data: { id_segmento: randomUUID(), nome }
    });
}

export const atualizarPlano = async (req: AuthRequest, res: Response) => {
    try {
        const usuarioId = req.usuarioId;
        if (!usuarioId) return res.status(401).json({ error: 'Não autorizado' });

        const { plano } = req.body as { plano?: string };
        if (plano !== 'basico' && plano !== 'premium') {
            return res.status(400).json({ error: 'Plano inválido. Use basico ou premium.' });
        }

        const atualizado = await prisma.usuario.update({
            where: { id_usuario: usuarioId },
            data: { plano }
        });

        return res.json({
            message: `Assinatura alterada para ${plano} com sucesso!`,
            plano: atualizado.plano || 'basico'
        });
    } catch (error) {
        console.error('Erro ao atualizar plano:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar plano' });
    }
};