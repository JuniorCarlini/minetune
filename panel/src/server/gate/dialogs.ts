/**
 * Janelas (dialogs) do portão, montadas em NBT. A língua vem do próprio jogo do jogador
 * (Client Information): pt_*, es_* ou, para o resto, inglês.
 */

import { NbtByte, NbtInt, type NbtValue } from './protocol.ts';
import { PASSWORD_MAX, PASSWORD_MIN } from './accounts.ts';

export type GateLocale = 'pt' | 'en' | 'es';

export function gateLocale(language: string | undefined): GateLocale {
  const tag = (language ?? '').toLowerCase();
  if (tag.startsWith('pt')) return 'pt';
  if (tag.startsWith('es')) return 'es';
  return 'en';
}

const TEXTS = {
  pt: {
    registerTitle: 'Criar sua senha',
    registerBody: (name: string) =>
      `Bem-vindo, ${name}! Este servidor protege cada nick com uma senha. Crie a sua: você vai usá-la sempre que entrar. O campo não esconde o que você digita.`,
    loginTitle: 'Entrar',
    loginBody: (name: string) => `Olá, ${name}. Digite sua senha para entrar no servidor. O campo não esconde o que você digita.`,
    password: 'Senha',
    confirm: 'Repita a senha',
    registerButton: 'Criar e entrar',
    loginButton: 'Entrar',
    tooShort: `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`,
    mismatch: 'As duas senhas não são iguais.',
    sameAsName: 'A senha não pode ser o seu nick.',
    wrong: (left: number) => `Senha incorreta. ${left === 1 ? 'Resta 1 tentativa.' : `Restam ${left} tentativas.`}`,
    kickWrong: 'Senha incorreta muitas vezes. Tente de novo em alguns minutos.',
    kickBlocked: 'Muitas tentativas erradas deste endereço. Tente de novo em alguns minutos.',
    kickTimeout: 'Tempo para digitar a senha esgotado. Entre de novo.',
    kickOnline: (name: string) => `O nick ${name} já está no servidor ou entrando agora.`,
    kickName: 'Nick inválido. Use só letras, números e _, de 3 a 16 caracteres.',
    kickVersion: (version: string) => `Este servidor usa o Minecraft ${version}. Entre com essa versão.`,
    kickBanned: 'Você está banido deste servidor.',
    kickBackend: 'O servidor não respondeu. Tente de novo em instantes.',
    kickError: 'Algo deu errado no portão de login. Tente de novo.',
    kickPasswordRequired: 'O servidor passou a pedir senha. Entre de novo para criar ou digitar a sua.',
  },
  en: {
    registerTitle: 'Create your password',
    registerBody: (name: string) =>
      `Welcome, ${name}! This server protects each nickname with a password. Create yours: you'll use it every time you join. The field does not hide what you type.`,
    loginTitle: 'Log in',
    loginBody: (name: string) => `Hi, ${name}. Type your password to join the server. The field does not hide what you type.`,
    password: 'Password',
    confirm: 'Repeat the password',
    registerButton: 'Create and join',
    loginButton: 'Join',
    tooShort: `The password needs at least ${PASSWORD_MIN} characters.`,
    mismatch: "The two passwords don't match.",
    sameAsName: "The password can't be your nickname.",
    wrong: (left: number) => `Wrong password. ${left === 1 ? '1 attempt left.' : `${left} attempts left.`}`,
    kickWrong: 'Wrong password too many times. Try again in a few minutes.',
    kickBlocked: 'Too many wrong attempts from this address. Try again in a few minutes.',
    kickTimeout: 'Time to type the password is over. Join again.',
    kickOnline: (name: string) => `${name} is already on the server or joining right now.`,
    kickName: 'Invalid nickname. Use only letters, numbers and _, 3 to 16 characters.',
    kickVersion: (version: string) => `This server runs Minecraft ${version}. Join with that version.`,
    kickBanned: 'You are banned from this server.',
    kickBackend: "The server didn't respond. Try again in a moment.",
    kickError: 'Something went wrong at the login gate. Try again.',
    kickPasswordRequired: 'The server now requires a password. Join again to create or type yours.',
  },
  es: {
    registerTitle: 'Crea tu contraseña',
    registerBody: (name: string) =>
      `¡Bienvenido, ${name}! Este servidor protege cada nick con una contraseña. Crea la tuya: la usarás cada vez que entres. El campo no oculta lo que escribes.`,
    loginTitle: 'Entrar',
    loginBody: (name: string) => `Hola, ${name}. Escribe tu contraseña para entrar al servidor. El campo no oculta lo que escribes.`,
    password: 'Contraseña',
    confirm: 'Repite la contraseña',
    registerButton: 'Crear y entrar',
    loginButton: 'Entrar',
    tooShort: `La contraseña necesita al menos ${PASSWORD_MIN} caracteres.`,
    mismatch: 'Las dos contraseñas no coinciden.',
    sameAsName: 'La contraseña no puede ser tu nick.',
    wrong: (left: number) => `Contraseña incorrecta. ${left === 1 ? 'Queda 1 intento.' : `Quedan ${left} intentos.`}`,
    kickWrong: 'Contraseña incorrecta demasiadas veces. Inténtalo de nuevo en unos minutos.',
    kickBlocked: 'Demasiados intentos fallidos desde esta dirección. Inténtalo de nuevo en unos minutos.',
    kickTimeout: 'Se acabó el tiempo para escribir la contraseña. Entra de nuevo.',
    kickOnline: (name: string) => `El nick ${name} ya está en el servidor o entrando ahora.`,
    kickName: 'Nick no válido. Usa solo letras, números y _, de 3 a 16 caracteres.',
    kickVersion: (version: string) => `Este servidor usa Minecraft ${version}. Entra con esa versión.`,
    kickBanned: 'Estás baneado de este servidor.',
    kickBackend: 'El servidor no respondió. Inténtalo de nuevo en un momento.',
    kickError: 'Algo salió mal en la puerta de inicio de sesión. Inténtalo de nuevo.',
    kickPasswordRequired: 'El servidor ahora pide contraseña. Vuelve a entrar para crear o escribir la tuya.',
  },
};

export type GateTexts = (typeof TEXTS)['pt'];

export function gateTexts(locale: GateLocale): GateTexts {
  return TEXTS[locale];
}

export const REGISTER_ACTION = 'minetune:register';
export const LOGIN_ACTION = 'minetune:login';

const message = (contents: string, color?: string): NbtValue => ({
  type: 'minecraft:plain_message',
  contents: color ? { text: contents, color } : contents,
  width: new NbtInt(300),
});

const passwordInput = (key: string, label: string): NbtValue => ({
  type: 'minecraft:text',
  key,
  label,
  width: new NbtInt(260),
  max_length: new NbtInt(PASSWORD_MAX),
});

/** Janela de cadastro (primeira vez) ou de login, com um aviso em vermelho quando algo deu errado. */
export function authDialog(kind: 'register' | 'login', name: string, t: GateTexts, error?: string): NbtValue {
  const body: NbtValue[] = [message(kind === 'register' ? t.registerBody(name) : t.loginBody(name))];
  if (error) body.push(message(error, 'red'));
  const inputs: NbtValue[] = [passwordInput('password', t.password)];
  if (kind === 'register') inputs.push(passwordInput('confirm', t.confirm));
  return {
    type: 'minecraft:notice',
    title: kind === 'register' ? t.registerTitle : t.loginTitle,
    body,
    inputs,
    // Sem fechar com Esc: a janela é o único caminho para entrar.
    can_close_with_escape: new NbtByte(0),
    after_action: 'wait_for_response',
    action: {
      label: kind === 'register' ? t.registerButton : t.loginButton,
      width: new NbtInt(200),
      action: { type: 'minecraft:dynamic/custom', id: kind === 'register' ? REGISTER_ACTION : LOGIN_ACTION },
    },
  };
}
