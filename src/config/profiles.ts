import type { SessionProfile } from './managerSession';

export interface ProfileInfo {
    id: SessionProfile;
    /** Como a pessoa é chamada na tela. */
    label: string;
    /** O que esse perfil enxerga, em primeira pessoa — usado nos cards do seletor. */
    description: string;
    /** O mesmo alcance em segunda pessoa, para a frase da home. */
    scope: string;
    /** Imagem em `public/`. Sem imagem, a tela usa a inicial do nome. */
    avatar?: string;
    /** Cor do círculo do avatar: aparece atrás da foto e no fundo da inicial. */
    tint: [string, string];
}

export const PROFILES: ProfileInfo[] = [
    {
        id: 'THIAGO',
        label: 'Thiago',
        description: 'Minhas cidades e parceiros',
        scope: 'suas cidades e parceiros',
        avatar: '/avatars/thiago.png',
        tint: ['#ffb238', '#f06a0c'],
    },
    {
        id: 'LAÍS',
        label: 'Laís',
        description: 'Minhas cidades e parceiros',
        scope: 'suas cidades e parceiros',
        avatar: '/avatars/lais.png',
        tint: ['#ff8dc0', '#d92d8f'],
    },
    {
        id: 'ULYSSES',
        label: 'Ulysses',
        description: 'Todas as cidades e parceiros',
        scope: 'todas as cidades e parceiros',
        avatar: '/avatars/ulysses.png',
        tint: ['#7ad4ff', '#2b7fd4'],
    },
];

export function getProfileInfo(id: SessionProfile | ''): ProfileInfo | undefined {
    return id ? PROFILES.find(profile => profile.id === id) : undefined;
}
