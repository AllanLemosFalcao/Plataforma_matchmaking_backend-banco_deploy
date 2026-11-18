export const LIMITE_ADERENCIA_BASICO = 40;
export const LIMITE_MATCHES_BASICO = 3;

export type EstagioStartupBanco = 'ideacao' | 'validacao' | 'tracao' | 'escala';
export type EstagioInvestidorBanco =
    | 'ideacao'
    | 'validacao'
    | 'MVP'
    | 'tracao_inicial'
    | 'crescimento___scale';

export const mapearEstagioStartup = (estagioFront: string): EstagioStartupBanco => {
    const mapa: Record<string, EstagioStartupBanco> = {
        'Ideação': 'ideacao',
        'Validação': 'validacao',
        'MVP': 'validacao',
        'Tração inicial': 'tracao',
        'Crescimento / Scale': 'escala'
    };
    return mapa[estagioFront] ?? 'ideacao';
};

export const desmapearEstagioStartup = (estagioBanco: string): string => {
    const mapa: Record<string, string> = {
        'ideacao': 'Ideação',
        'validacao': 'Validação',
        'tracao': 'Tração inicial',
        'escala': 'Crescimento / Scale'
    };
    return mapa[estagioBanco] ?? 'Ideação';
};

export const mapearEstagioInvestidor = (estagioFront: string): EstagioInvestidorBanco => {
    const mapa: Record<string, EstagioInvestidorBanco> = {
        'Ideação': 'ideacao',
        'Validação': 'validacao',
        'MVP': 'MVP',
        'Tração inicial': 'tracao_inicial',
        'Crescimento / Scale': 'crescimento___scale'
    };
    return mapa[estagioFront] ?? 'ideacao';
};

export const desmapearEstagioInvestidor = (estagioBanco: string): string => {
    const mapa: Record<string, string> = {
        'ideacao': 'Ideação',
        'validacao': 'Validação',
        'MVP': 'MVP',
        'tracao_inicial': 'Tração inicial',
        'crescimento___scale': 'Crescimento / Scale'
    };
    return mapa[estagioBanco] ?? 'Ideação';
};

export const estagioEhCompativel = (
    estagioStartup: string,
    estagiosInvestidorBanco: string[]
): boolean => {
    if (estagioStartup === 'ideacao') return estagiosInvestidorBanco.includes('ideacao');
    if (estagioStartup === 'validacao') {
        return estagiosInvestidorBanco.includes('validacao') || estagiosInvestidorBanco.includes('MVP');
    }
    if (estagioStartup === 'tracao') return estagiosInvestidorBanco.includes('tracao_inicial');
    if (estagioStartup === 'escala') return estagiosInvestidorBanco.includes('crescimento___scale');
    return false;
};

export interface DadosCompatibilidadeStartup {
    cidade?: string | null;
    estagio: string;
    investimento_pretendido?: unknown;
    segmentoNome: string;
}

export interface DadosCompatibilidadeInvestidor {
    cidade?: string | null;
    faixa_minima?: unknown;
    faixa_maxima?: unknown;
    segmentosInteresse: string[];
    estagiosPreferidosBanco: string[];
}

/**
 * Calcula aderência real de 20% a 100%:
 * Base: 20% | Segmento: +40% | Estágio: +20% | Cidade: +10% | Ticket: +10%
 */
export const calcularScoreCompatibilidade = (
    st: DadosCompatibilidadeStartup,
    inv: DadosCompatibilidadeInvestidor
): number => {
    let score = 20;

    if (st.segmentoNome && inv.segmentosInteresse.includes(st.segmentoNome)) {
        score += 40;
    }

    if (estagioEhCompativel(st.estagio, inv.estagiosPreferidosBanco)) {
        score += 20;
    }

    const cidSt = st.cidade?.trim().toLowerCase();
    const cidInv = inv.cidade?.trim().toLowerCase();
    if (cidSt && cidInv && cidSt === cidInv) {
        score += 10;
    }

    const pedido = Number(st.investimento_pretendido ?? 0);
    const min = Number(inv.faixa_minima ?? 0);
    const max = Number(inv.faixa_maxima ?? 0);
    if (pedido > 0 && (min > 0 || max > 0)) {
        const dentroMin = min === 0 || pedido >= min;
        const dentroMax = max === 0 || pedido <= max;
        if (dentroMin && dentroMax) {
            score += 10;
        }
    }

    return Math.min(score, 100);
};