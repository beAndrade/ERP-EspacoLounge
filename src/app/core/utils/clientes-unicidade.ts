import type { Cliente, ClienteCadastroPayload } from '../models/api.models';
import { telefoneBrDigitos } from './telefone-br';

export type ClienteDuplicadoCampo = 'nome' | 'celular' | 'cpf';

export type ClienteDuplicadoErro = {
  campo: ClienteDuplicadoCampo;
  message: string;
};

function cpfDigitos(v: string | null | undefined): string {
  return String(v ?? '').replace(/\D/g, '');
}

function celularDigitosPayload(payload: ClienteCadastroPayload): string {
  const cel = telefoneBrDigitos(payload.celular);
  if (cel.length >= 10) return cel;
  return telefoneBrDigitos(payload.telefone);
}

function clienteTemCelular(c: Cliente, digitos: string): boolean {
  if (digitos.length < 10) return false;
  return (
    telefoneBrDigitos(c.celular) === digitos ||
    telefoneBrDigitos(c.telefone) === digitos
  );
}

/** Verifica duplicidade na lista já carregada (pré-validação antes do POST). */
export function findClienteCadastroDuplicado(
  items: Cliente[],
  payload: ClienteCadastroPayload,
  excludeId?: string | null,
): ClienteDuplicadoErro | null {
  const excl = (excludeId ?? '').trim();
  const nomeNorm = payload.nome.trim().toLowerCase();
  if (nomeNorm) {
    const dup = items.some(
      (c) =>
        c.id.trim() !== excl &&
        c.nome.trim().toLowerCase() === nomeNorm,
    );
    if (dup) {
      return {
        campo: 'nome',
        message: 'Já existe um cliente com este nome',
      };
    }
  }

  const cel = celularDigitosPayload(payload);
  if (cel.length >= 10) {
    const dup = items.some(
      (c) => c.id.trim() !== excl && clienteTemCelular(c, cel),
    );
    if (dup) {
      return {
        campo: 'celular',
        message: 'Já existe um cliente com este celular',
      };
    }
  }

  const cpf = cpfDigitos(payload.cpf);
  if (cpf.length === 11) {
    const dup = items.some(
      (c) =>
        c.id.trim() !== excl && cpfDigitos(c.cpf) === cpf,
    );
    if (dup) {
      return {
        campo: 'cpf',
        message: 'Já existe um cliente com este CPF',
      };
    }
  }

  return null;
}
