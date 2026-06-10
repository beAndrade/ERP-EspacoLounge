export type UsuarioRole = 'admin' | 'profissional';

export interface AuthUser {
  id: number;
  email: string;
  role: UsuarioRole;
  profissional_id: number | null;
  nome_exibicao: string;
  foto_url?: string | null;
  ativo?: boolean;
  tem_senha?: boolean;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface ProfissionalUsuarioPayload {
  email: string;
  senha?: string;
  ativo?: boolean;
}
