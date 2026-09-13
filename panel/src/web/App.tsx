import { useEffect, useState, type ComponentType } from 'react';
import type { StatusResponse } from '../shared/api.ts';
import { BrandMark, Icon, type IconName } from './components/icons.tsx';
import { LOGO_VARIANTS, LOGOS, PixelLogo, setLogo, useLogo } from './components/logos.tsx';
import { Button, Modal, Spinner, ToastProvider, useTip } from './components/ui.tsx';
import { api, UNAUTHORIZED_EVENT } from './lib/api.ts';
import { useApi } from './lib/hooks.ts';
import { applyTheme, getStoredTheme, nextTheme, type ThemeMode } from './lib/theme.ts';
import { BackupDestinationPage } from './pages/BackupDestination.tsx';
import { BackupsPage } from './pages/Backups.tsx';
import { ConsolePage } from './pages/Console.tsx';
import { GameRulesPage } from './pages/GameRules.tsx';
import { LoginPage } from './pages/Login.tsx';
import { OverviewPage, serverStateBadge } from './pages/Overview.tsx';
import { PlayersPage } from './pages/Players.tsx';
import { PluginsPage } from './pages/Plugins.tsx';
import { SettingsPage } from './pages/Settings.tsx';

interface Route {
  path: string;
  label: string;
  icon: IconName;
  component: ComponentType;
  /** Subpágina: não aparece no menu e mantém o item pai marcado. */
  parent?: string;
}

const SECTIONS: { label: string; routes: Route[] }[] = [
  {
    label: 'Principal',
    routes: [
      { path: 'overview', label: 'Início', icon: 'dashboard', component: OverviewPage },
      { path: 'players', label: 'Jogadores', icon: 'players', component: PlayersPage },
      { path: 'gamerules', label: 'Regras do jogo', icon: 'rules', component: GameRulesPage },
    ],
  },
  {
    label: 'Servidor',
    routes: [
      { path: 'settings', label: 'Configurações', icon: 'settings', component: SettingsPage },
      { path: 'plugins', label: 'Plugins e mods', icon: 'plugins', component: PluginsPage },
      { path: 'backups', label: 'Backups', icon: 'backups', component: BackupsPage },
    ],
  },
  {
    label: 'Avançado',
    routes: [{ path: 'console', label: 'Console', icon: 'console', component: ConsolePage }],
  },
];

const SUBPAGES: Route[] = [
  { path: 'backups/destino', label: 'Onde guardar os backups', icon: 'backups', component: BackupDestinationPage, parent: 'backups' },
];

const ROUTES = [...SECTIONS.flatMap((s) => s.routes), ...SUBPAGES];

function useHashRoute(): string {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'overview';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function App() {
  const [session, setSession] = useState<{ authenticated: boolean; instance?: string }>();

  useEffect(() => {
    api.get<{ authenticated: boolean; instance: string }>('/me').then(setSession, () => setSession({ authenticated: false }));
    const onUnauthorized = () => setSession((s) => ({ ...s, authenticated: false }));
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (!session) {
    return (
      <div className="center-screen">
        <Spinner />
      </div>
    );
  }

  if (!session.authenticated) {
    return <LoginPage onLogin={() => api.get<{ authenticated: boolean; instance: string }>('/me').then(setSession)} />;
  }

  return (
    <ToastProvider>
      <Shell instance={session.instance} onLogout={() => setSession({ authenticated: false })} />
    </ToastProvider>
  );
}

function Shell({ instance, onLogout }: { instance?: string; onLogout: () => void }) {
  const route = useHashRoute();
  const status = useApi<StatusResponse>('/status', 10_000);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const logoTip = useTip<HTMLButtonElement>('Aparência: logo e tema');
  const current = ROUTES.find((r) => r.path === route) ?? ROUTES[0]!;
  const activePath = current.parent ?? current.path;
  const Page = current.component;

  const logout = async () => {
    await api.post('/logout');
    onLogout();
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <button ref={logoTip} type="button" className="brand-logo" aria-label="Aparência: logo e tema" onClick={() => setAppearanceOpen(true)}>
            <BrandMark size={32} />
          </button>
          <div>
            <strong className="mc-title" data-text="Minetune">Minetune</strong>
            <span className="brand-version">{instance && instance !== 'minetune' ? instance : 'painel'} · v0.1</span>
          </div>
          <ThemeButton />
        </div>

        <nav className="tuc-menu" aria-label="Navegação">
          {SECTIONS.map((section) => (
            <div key={section.label} style={{ display: 'contents' }}>
              <div className="tuc-menu__section">{section.label}</div>
              {section.routes.map((r) => (
                <a
                  key={r.path}
                  href={`#/${r.path}`}
                  className={`tuc-menu__item ${r.path === activePath ? 'is-active' : ''}`}
                  aria-current={r.path === activePath ? 'page' : undefined}
                  title={r.label}
                >
                  <span className="tuc-menu__icon">
                    <Icon name={r.icon} />
                  </span>
                  <span className="tuc-menu__label">{r.label}</span>
                  {r.path === 'players' && status.data?.players && status.data.players.online > 0 && (
                    <span className="tuc-menu__count">{status.data.players.online}</span>
                  )}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {status.data && <SidebarStatus data={status.data} />}
          <button type="button" className="tuc-menu__item sidebar-logout" onClick={() => setLogoutOpen(true)}>
            <span className="tuc-menu__icon">
              <Icon name="logout" />
            </span>
            <span className="tuc-menu__label">Sair</span>
          </button>
        </div>
      </aside>
      <main className="content">
        {/* A key remonta o wrapper a cada troca de rota, e isso reinicia a animação de entrada. */}
        <div key={current.path} className="page">
          <Page />
        </div>
      </main>
      <AppearanceModal open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
      <Modal
        open={logoutOpen}
        title="Sair do painel?"
        text="Para entrar de novo será preciso digitar a senha do painel."
        tone="danger"
        size="sm"
        onClose={() => setLogoutOpen(false)}
        footer={
          <>
            <Button onClick={() => setLogoutOpen(false)}>
              <Icon name="x" /> Cancelar
            </Button>
            <Button variant="danger" onClick={logout}>
              <Icon name="logout" size={16} /> Sair
            </Button>
          </>
        }
      />
    </div>
  );
}

function AppearanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useLogo();
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);

  const chooseTheme = (mode: ThemeMode) => {
    applyTheme(mode);
    setTheme(mode);
  };

  return (
    <Modal
      open={open}
      title="Aparência"
      text="A escolha fica salva neste navegador e troca o logo do menu, do login e da aba."
      size="lg"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          <Icon name="check" /> Pronto
        </Button>
      }
    >
      <div className="field">
        <span className="field-label">Logo</span>
        <div className="logo-options" role="radiogroup" aria-label="Logo">
          {LOGO_VARIANTS.map((variant) => (
            <button
              key={variant}
              type="button"
              role="radio"
              aria-checked={variant === current}
              className={`logo-option ${variant === current ? 'is-selected' : ''}`}
              onClick={() => setLogo(variant)}
            >
              <PixelLogo variant={variant} size={72} />
              <strong>{LOGOS[variant].name}</strong>
              <span>{LOGOS[variant].note}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Tema</span>
        <div className="row">
          {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
            <Button key={mode} size="sm" variant={theme === mode ? 'primary' : 'secondary'} onClick={() => chooseTheme(mode)}>
              <Icon name={THEME_ICON[mode]} size={13} /> {THEME_LABEL[mode].replace('Tema: ', '')}
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

const THEME_LABEL: Record<ThemeMode, string> = { system: 'Tema: sistema', light: 'Tema: claro', dark: 'Tema: escuro' };
const THEME_ICON: Record<ThemeMode, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

function ThemeButton() {
  const [mode, setMode] = useState<ThemeMode>(getStoredTheme);
  const tip = useTip<HTMLButtonElement>(THEME_LABEL[mode]);
  return (
    <Button
      ref={tip}
      variant="secondary"
      size="sm"
      iconOnly
      aria-label={THEME_LABEL[mode]}
      onClick={() => {
        const next = nextTheme(mode);
        applyTheme(next);
        setMode(next);
      }}
    >
      <Icon name={THEME_ICON[mode]} size={14} />
    </Button>
  );
}

function SidebarStatus({ data }: { data: StatusResponse }) {
  const state = serverStateBadge(data.server);
  return (
    <a className="sidebar-status" href="#/overview">
      <span className={`status-dot status-${state.tone}`} />
      <div>
        <strong>{state.label}</strong>
        <span>{data.players ? `${data.players.online}/${data.players.max} jogadores` : `${data.game.type} ${data.game.version}`}</span>
      </div>
    </a>
  );
}
