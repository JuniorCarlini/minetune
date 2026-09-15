import { useState, type ReactNode } from 'react';
import { compareVersions, compatibility, imageTagFor, versionNumbers, type VersionInfo, type VersionsResponse } from '../../shared/versions.ts';
import { useApi } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';
import { Input, Toggle, TucSelect } from './ui.tsx';

const LATEST = 'LATEST';

/**
 * Troca {nome} do texto traduzido por <code>: a frase muda de ordem em cada língua,
 * mas os trechos técnicos (arquivo, variável, comando) continuam destacados.
 */
function withCode(text: string, codes: Record<string, string>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    return name && name in codes ? <code key={i}>{codes[name]}</code> : part;
  });
}

/**
 * Seletor de versão do Minecraft para o software escolhido.
 *
 * Mostra as estáveis mais recentes primeiro, marca as que exigem outra imagem de
 * Java e avisa quando a troca volta para uma versão mais antiga que a salva (o
 * jogo não abre mundo de versão mais nova). Se a fonte oficial falhar, vira um
 * campo de texto para não travar ninguém.
 */
export function VersionPicker({
  id,
  serverType,
  value,
  savedValue,
  invalid,
  onChange,
  showUnstable: showUnstableProp,
}: {
  id: string;
  serverType: string;
  value: string;
  savedValue: string;
  invalid: boolean;
  onChange: (value: string) => void;
  /** Controlado por fora (interruptor na linha do nome): o daqui de baixo some. */
  showUnstable?: boolean;
}) {
  const m = useMessages();
  const t = m.settings.version;
  const type = (serverType || 'VANILLA').toUpperCase();
  const { data, error, loading } = useApi<VersionsResponse>(`/versions?type=${encodeURIComponent(type)}`);
  const [showUnstableState, setShowUnstable] = useState(false);
  const controlled = showUnstableProp !== undefined;
  const showUnstable = controlled ? showUnstableProp : showUnstableState;

  const failed = error || data?.error;
  if (!data || failed) {
    return (
      <div className="version-picker">
        <Input id={id} placeholder="26.2" value={value} invalid={invalid} onChange={(e) => onChange(e.target.value)} />
        <span className="version-note muted">
          {loading ? t.loading : t.unavailable(failed ? (error?.message ?? data?.error ?? t.noResponse) : t.noResponse)}
        </span>
      </div>
    );
  }

  const selected = data.versions.find((v) => v.id === value);
  const visible = data.versions.filter((v) => showUnstable || v.stable || v.id === value);
  const label = (v: VersionInfo) => {
    const parts = [v.id];
    if (v.id === data.latest) parts.push(t.tagLatest);
    if (!v.stable) parts.push(t.tagTest);
    if (compatibility(v.java, data.imageJava) !== 'ok') parts.push(t.requires(imageTagFor(v.java!)));
    return parts.join(' · ');
  };

  const options = [{ value: LATEST, label: t.latestOption(data.latest) }, ...visible.map((v) => ({ value: v.id, label: label(v) }))];
  // Valor salvo que não está na lista (ex.: digitado à mão) continua selecionável.
  if (value && !options.some((o) => o.value === value)) options.splice(1, 0, { value, label: `${value} · ${t.custom}` });

  const compat = selected ? compatibility(selected.java, data.imageJava) : 'ok';
  const isDowngrade =
    !!value && !!savedValue && value !== savedValue && versionNumbers(value) && versionNumbers(savedValue) && compareVersions(value, savedValue) < 0;
  const hasUnstable = data.versions.some((v) => !v.stable);

  return (
    <div className="version-picker">
      <TucSelect id={id} value={value} options={options} placeholder={t.placeholder} onChange={onChange} />

      {hasUnstable && !controlled && (
        <label className="version-toggle">
          <Toggle label={t.showTestAria} checked={showUnstable} onChange={setShowUnstable} />
          <span className="muted small">{m.settings.input.showUnstable}</span>
        </label>
      )}

      {compat !== 'ok' && selected?.java && (
        <span className="version-note is-warning">
          {withCode(t.javaNote(selected.id, selected.java, data.imageJava), {
            env: '.env',
            tag: `MC_IMAGE_TAG=${imageTagFor(selected.java)}`,
            cmd: 'make up',
          })}
        </span>
      )}

      {isDowngrade && <span className="version-note is-danger">{t.downgrade(savedValue, value)}</span>}

      {!selected?.stable && selected && <span className="version-note is-warning">{t.testWarning}</span>}
    </div>
  );
}
