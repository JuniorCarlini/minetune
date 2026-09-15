import { useState, type FormEvent } from 'react';
import { BrandMark, Icon } from '../components/icons.tsx';
import { LanguagePicker } from '../components/LanguagePicker.tsx';
import { Button, Input, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useMessages } from '../lib/i18n.tsx';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const m = useMessages();
  const [password, setPassword] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api.post('/login', { password });
      onLogin();
    } catch (err) {
      // Mesma notificação do resto do painel; o campo fica marcado até a próxima digitação.
      toast.error(err);
      setInvalid(true);
      setLoading(false);
    }
  };

  return (
    <div className="login-split">
      <section className="login-pane">
        <form className="login-form" onSubmit={submit}>
          <div className="login-head">
            <BrandMark size={40} />
            <h1 className="mc-title" data-text="Minetune">
              Minetune
            </h1>
          </div>
          <label className="field">
            <span className="field-label">{m.app.login.password}</span>
            <Input
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder={m.app.login.placeholder}
              value={password}
              invalid={invalid}
              aria-invalid={invalid || undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                setInvalid(false);
              }}
            />
          </label>
          <Button variant="primary" size="lg" block type="submit" loading={loading} disabled={!password}>
            <Icon name="login" /> {m.app.login.submit}
          </Button>
          {/* Antes de entrar já dá para trocar a língua: quem não lê português acha a sua pelo nome. */}
          <LanguagePicker />
        </form>
        <footer className="login-credit">
          <span className="login-credit__made">
            {m.app.login.madeWith}
            <span className="login-credit__heart">
              <Icon name="heart" size={16} />
            </span>
            {m.app.login.by}
          </span>
          <a className="tuc-btn is-outline is-sm" href="https://github.com/JuniorCarlini" target="_blank" rel="noreferrer">
            <Icon name="github" size={16} /> JuniorCarlini
          </a>
        </footer>
      </section>
      <aside className="login-art" aria-hidden />
    </div>
  );
}
