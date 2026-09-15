import { useEffect, useState, type ComponentType } from 'react';
import type { StatusResponse } from '../shared/api.ts';
import type { Messages } from '../shared/i18n/index.ts';
import { BrandMark, Icon, type IconName } from './components/icons.tsx';
import { LanguagePicker } from './components/LanguagePicker.tsx';
import { Drawer } from './components/ui.tsx';
import { ServerCard } from './components/ServerCard.tsx';
import { WorldSwitcher } from './components/WorldControls.tsx';
import { useWorld, WorldProvider } from './lib/world.tsx';
import { LOGO_VARIANTS, PixelLogo, setLogo, useLogo } from './components/logos.tsx';
import { Button, Modal, Spinner, ToastProvider, useTip } from './components/ui.tsx';
import { api, UNAUTHORIZED_EVENT } from './lib/api.ts';
import { useApi } from './lib/hooks.ts';
import { useMessages } from './lib/i18n.tsx';
import { applyTheme, getStoredTheme, nextTheme, type ThemeMode } from './lib/theme.ts';
import { BackupDestinationPage } from './pages/BackupDestination.tsx';
import { BackupsPage } from './pages/Backups.tsx';
import { ConsolePage } from './pages/Console.tsx';
import { CreateWorldPage } from './pages/CreateWorld.tsx';
import { GameRulesPage } from './pages/GameRules.tsx';
import { LoginPage } from './pages/Login.tsx';
import { OverviewPage, serverStateBadge } from './pages/Overview.tsx';
import { PlayersPage } from './pages/Players.tsx';
import { PluginsPage } from './pages/Plugins.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { WorldsPage } from './pages/Worlds.tsx';

type RouteKey = keyof Messages['app']['routes'];

interface Route {
  path: string;
  /** Chave do nome em m.app.routes: a lista fica fixa e o nome segue a língua escolhida. */
  label: RouteKey;
  icon: IconName;
  component: ComponentType;
  /** Subpágina: não aparece no menu e mantém o item pai marcado. */
  parent?: string;
}

const SECTIONS: { label: keyof Messages['app']['nav']; routes: Route[] }[] = [
  {
    label: 'main',
    routes: [
      { path: 'overview', label: 'overview', icon: 'dashboard', component: OverviewPage },
      { path: 'players', label: 'players', icon: 'players', component: PlayersPage },
      { path: 'worlds', label: 'worlds', icon: 'globe', component: WorldsPage },
      { path: 'gamerules', label: 'gamerules', icon: 'rules', component: GameRulesPage },
    ],
  },
  {
    label: 'server',
    routes: [
      { path: 'settings', label: 'settings', icon: 'settings', component: SettingsPage },
      { path: 'plugins', label: 'plugins', icon: 'plugins', component: PluginsPage },
      { path: 'backups', label: 'backups', icon: 'backups', component: BackupsPage },
    ],
  },
  {
    label: 'advanced',
    routes: [{ path: 'console', label: 'console', icon: 'console', component: ConsolePage }],
  },
];

const SUBPAGES: Route[] = [
  { path: 'backups/destino', label: 'backupDestination', icon: 'backups', component: BackupDestinationPage, parent: 'backups' },
  { path: 'worlds/novo', label: 'createWorld', icon: 'globe', component: CreateWorldPage, parent: 'worlds' },
];

const ROUTES = [...SECTIONS.flatMap((s) => s.routes), ...SUBPAGES];

/** Largura em que a barra lateral vira gaveta (mesmo corte do CSS). */
const MOBILE_QUERY = '(max-width: 860px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

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
      <WorldProvider>
        <Shell instance={session.instance} onLogout={() => setSession({ authenticated: false })} />
      </WorldProvider>
    </ToastProvider>
  );
}

function Shell({ instance, onLogout }: { instance?: string; onLogout: () => void }) {
  const m = useMessages();
  const route = useHashRoute();
  const status = useApi<StatusResponse>('/status', 10_000);
  const world = useWorld();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const mobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  // Trocar de página (ou voltar para a tela larga) fecha a gaveta.
  useEffect(() => setMenuOpen(false), [route, mobile]);
  const logoTip = useTip<HTMLButtonElement>(m.app.appearanceTip);
  const current = ROUTES.find((r) => r.path === route) ?? ROUTES[0]!;
  const activePath = current.parent ?? current.path;
  const Page = current.component;

  const logout = async () => {
    await api.post('/logout');
    onLogout();
  };

  // Conteúdo da barra lateral: fixo ao lado no computador, dentro da gaveta no celular.
  const sidebarContent = (
    <>
      <div className="brand">
        <button
          ref={logoTip}
          type="button"
          className="brand-logo"
          aria-label={m.app.appearanceTip}
          onClick={() => {
            setMenuOpen(false);
            setAppearanceOpen(true);
          }}
        >
          <BrandMark size={32} />
        </button>
        <div>
          <strong className="mc-title" data-text="Minetune">Minetune</strong>
          <span className="brand-version">{instance && instance !== 'minetune' ? instance : m.app.brandPanel} · v0.2</span>
        </div>
        <ThemeButton />
      </div>

      <WorldSwitcher />

      <nav className="tuc-menu" aria-label={m.app.nav.label}>
        {SECTIONS.map((section) => (
          <div key={section.label} style={{ display: 'contents' }}>
            <div className="tuc-menu__section">{m.app.nav[section.label]}</div>
            {section.routes.map((r) => (
              <a
                key={r.path}
                href={`#/${r.path}`}
                className={`tuc-menu__item ${r.path === activePath ? 'is-active' : ''}`}
                aria-current={r.path === activePath ? 'page' : undefined}
                title={m.app.routes[r.label]}
                // Tocar na página em que já está não muda a rota: fecha a gaveta mesmo assim.
                onClick={() => setMenuOpen(false)}
              >
                <span className="tuc-menu__icon">
                  <Icon name={r.icon} />
                </span>
                <span className="tuc-menu__label">{m.app.routes[r.label]}</span>
                {/* Quem está online é do mundo que roda: num mundo guardado o número confundiria. */}
                {r.path === 'players' && world.isActive && status.data?.players && status.data.players.online > 0 && (
                  <span className="tuc-menu__count">{status.data.players.online}</span>
                )}
              </a>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {status.data && <SidebarStatus data={status.data} worldName={world.worlds.find((w) => w.active)?.name ?? status.data.world} />}
        <button
          type="button"
          className="tuc-menu__item sidebar-logout"
          onClick={() => {
            setMenuOpen(false);
            setLogoutOpen(true);
          }}
        >
          <span className="tuc-menu__icon">
            <Icon name="logout" />
          </span>
          <span className="tuc-menu__label">{m.app.logout}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="layout">
      {mobile ? (
        // Celular: barra fina no topo; o menu completo abre na gaveta do Tucano.
        <header className="mobile-topbar">
          <button
            type="button"
            className="tuc-btn is-outline is-icon mobile-menu-button"
            aria-label={m.app.nav.label}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span className="hamburger" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>
          <a className="mobile-brand" href="#/overview">
            <BrandMark size={26} />
            <strong className="mc-title" data-text="Minetune">
              Minetune
            </strong>
          </a>
          {status.data && (
            <span className="mobile-topbar-status" title={serverStateBadge(status.data.server, m).label}>
              <span className={`status-dot status-${serverStateBadge(status.data.server, m).tone}`} />
            </span>
          )}
        </header>
      ) : (
        <aside className="sidebar">{sidebarContent}</aside>
      )}
      <main className="content">
        {/* No Início o servidor aparece no bloco grande da própria tela; nas outras, no card compacto. */}
        {current.path !== 'overview' && <ServerCard />}
        {/* A key remonta o wrapper a cada troca de rota, e isso reinicia a animação de entrada. */}
        <div key={current.path} className="page">
          <Page />
        </div>
      </main>
      {mobile && (
        <Drawer open={menuOpen} title={m.app.nav.label} side="left" size="md" className="sidebar-drawer" onClose={() => setMenuOpen(false)}>
          <div className="sidebar sidebar-in-drawer">{sidebarContent}</div>
        </Drawer>
      )}
      <AppearanceModal open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
      <Modal
        open={logoutOpen}
        title={m.app.logoutTitle}
        text={m.app.logoutText}
        tone="danger"
        size="sm"
        onClose={() => setLogoutOpen(false)}
        footer={
          <>
            <Button onClick={() => setLogoutOpen(false)}>
              <Icon name="x" /> {m.common.cancel}
            </Button>
            <Button variant="danger" onClick={logout}>
              <Icon name="logout" size={16} /> {m.app.logout}
            </Button>
          </>
        }
      />
    </div>
  );
}

function AppearanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useMessages();
  const current = useLogo();
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);

  const chooseTheme = (mode: ThemeMode) => {
    applyTheme(mode);
    setTheme(mode);
  };

  return (
    <Modal
      open={open}
      title={m.app.appearance.title}
      text={m.app.appearance.text}
      size="lg"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          <Icon name="check" /> {m.common.done}
        </Button>
      }
    >
      <div className="field">
        <span className="field-label">{m.app.appearance.logo}</span>
        <div className="logo-options" role="radiogroup" aria-label={m.app.appearance.logo}>
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
              <strong>{m.app.logos[variant].name}</strong>
              <span>{m.app.logos[variant].note}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">{m.common.language}</span>
        <LanguagePicker />
      </div>

      <div className="field">
        <span className="field-label">{m.app.appearance.theme}</span>
        <div className="row">
          {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
            <Button key={mode} size="sm" variant={theme === mode ? 'primary' : 'secondary'} onClick={() => chooseTheme(mode)}>
              <Icon name={THEME_ICON[mode]} size={13} /> {m.app.themes[mode]}
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

const THEME_ICON: Record<ThemeMode, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

function ThemeButton() {
  const m = useMessages();
  const [mode, setMode] = useState<ThemeMode>(getStoredTheme);
  const label = m.app.themeLabel(m.app.themes[mode]);
  const tip = useTip<HTMLButtonElement>(label);
  return (
    <Button
      ref={tip}
      variant="secondary"
      size="sm"
      iconOnly
      aria-label={label}
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

/** Rodapé da barra: o servidor (a máquina) e qual mundo ele roda, seja qual for o mundo na tela. */
function SidebarStatus({ data, worldName }: { data: StatusResponse; worldName?: string }) {
  const m = useMessages();
  const state = serverStateBadge(data.server, m);
  const detail = data.players ? m.app.sidebarPlayers(data.players.online, data.players.max) : `${data.game.type} ${data.game.version}`;
  return (
    <a className="sidebar-status" href="#/overview">
      <span className={`status-dot status-${state.tone}`} />
      <div>
        <strong>{m.app.sidebarServer(state.label.toLowerCase())}</strong>
        <span>{worldName ? `${worldName} · ${detail}` : detail}</span>
      </div>
    </a>
  );
}
