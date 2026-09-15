/**
 * Enviar, baixar e recuperar mundos: tipos que a tela e o servidor compartilham.
 * O servidor devolve os problemas de um .zip recusado já escritos na língua de quem enviou.
 */

import { PT, type Messages } from './i18n/index.ts';

export type ArchiveProblemCode =
  | 'notZip'
  | 'empty'
  | 'encrypted'
  | 'unsafePath'
  | 'special'
  | 'zipBomb'
  | 'tooManyFiles'
  | 'tooBig'
  | 'noSpace'
  | 'executable'
  | 'foreignFile'
  | 'noLevelDat'
  | 'manyWorlds'
  | 'bedrock'
  | 'invalidLevelDat';

export interface ArchiveProblem {
  code: ArchiveProblemCode;
  /** Arquivo dentro do .zip que causou o problema, quando há um. */
  path?: string;
  /** Números do problema (limite, tamanho, quantidade). */
  value?: number;
  extra?: number;
}

/** Resposta 422 do envio: o arquivo não foi aceito e nada foi extraído. */
export interface UploadRejectedResponse {
  error: string;
  problems: string[];
}

export interface UploadAcceptedResponse {
  jobId: string;
  folder: string;
}

/** Mundos que existiam dentro de uma cópia de segurança. */
export interface BackupWorldsResponse {
  snapshotId: string;
  worlds: { folder: string; name: string }[];
}

/** Quantos problemas a tela mostra; o resto vira "e mais N". */
export const MAX_LISTED_PROBLEMS = 12;

export function describeArchiveProblem(problem: ArchiveProblem, m: Messages = PT): string {
  const t = m.archive.problems;
  const path = problem.path ?? '';
  switch (problem.code) {
    case 'notZip':
      return t.notZip;
    case 'empty':
      return t.empty;
    case 'encrypted':
      return t.encrypted(path);
    case 'unsafePath':
      return t.unsafePath(path);
    case 'special':
      return t.special(path);
    case 'zipBomb':
      return t.zipBomb(path);
    case 'tooManyFiles':
      return t.tooManyFiles(problem.value ?? 0);
    case 'tooBig':
      return t.tooBig(problem.value ?? 0, problem.extra ?? 0);
    case 'noSpace':
      return t.noSpace(problem.value ?? 0, problem.extra ?? 0);
    case 'executable':
      return t.executable(path);
    case 'foreignFile':
      return t.foreignFile(path);
    case 'noLevelDat':
      return t.noLevelDat;
    case 'manyWorlds':
      return t.manyWorlds(problem.value ?? 0);
    case 'bedrock':
      return t.bedrock;
    case 'invalidLevelDat':
      return t.invalidLevelDat;
  }
}

/** Lista curta para a tela: os primeiros problemas e quantos ficaram de fora. */
export function describeArchiveProblems(problems: ArchiveProblem[], m: Messages = PT): string[] {
  const listed = problems.slice(0, MAX_LISTED_PROBLEMS).map((p) => describeArchiveProblem(p, m));
  if (problems.length > MAX_LISTED_PROBLEMS) listed.push(m.archive.problems.more(problems.length - MAX_LISTED_PROBLEMS));
  return listed;
}

/** Tamanho em GB com uma casa, para as mensagens (sem depender do formatador da tela). */
export function gigabytes(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(bytes < 10 * 1024 ** 3 ? 1 : 0);
}
