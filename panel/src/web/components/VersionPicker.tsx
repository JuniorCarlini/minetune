import { useState } from 'react';
import { compareVersions, compatibility, imageTagFor, versionNumbers, type VersionInfo, type VersionsResponse } from '../../shared/versions.ts';
import { useApi } from '../lib/hooks.ts';
import { Input, Toggle, TucSelect } from './ui.tsx';

const LATEST = 'LATEST';

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
}: {
  id: string;
  serverType: string;
  value: string;
  savedValue: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const type = (serverType || 'VANILLA').toUpperCase();
  const { data, error, loading } = useApi<VersionsResponse>(`/versions?type=${encodeURIComponent(type)}`);
  const [showUnstable, setShowUnstable] = useState(false);

  const failed = error || data?.error;
  if (!data || failed) {
    return (
      <div className="version-picker">
        <Input id={id} placeholder="26.2" value={value} invalid={invalid} onChange={(e) => onChange(e.target.value)} />
        <span className="version-note muted">
          {loading ? 'Buscando versões disponíveis…' : `Lista de versões indisponível (${failed ? (error?.message ?? data?.error) : 'sem resposta'}). Digite a versão.`}
        </span>
      </div>
    );
  }

  const selected = data.versions.find((v) => v.id === value);
  const visible = data.versions.filter((v) => showUnstable || v.stable || v.id === value);
  const label = (v: VersionInfo) => {
    const parts = [v.id];
    if (v.id === data.latest) parts.push('mais recente');
    if (!v.stable) parts.push('teste');
    if (compatibility(v.java, data.imageJava) !== 'ok') parts.push(`requer ${imageTagFor(v.java!)}`);
    return parts.join(' · ');
  };

  const options = [
    { value: LATEST, label: `Sempre a mais recente${data.latest ? ` (hoje ${data.latest})` : ''}` },
    ...visible.map((v) => ({ value: v.id, label: label(v) })),
  ];
  // Valor salvo que não está na lista (ex.: digitado à mão) continua selecionável.
  if (value && !options.some((o) => o.value === value)) options.splice(1, 0, { value, label: `${value} · personalizada` });

  const compat = selected ? compatibility(selected.java, data.imageJava) : 'ok';
  const isDowngrade =
    !!value && !!savedValue && value !== savedValue && versionNumbers(value) && versionNumbers(savedValue) && compareVersions(value, savedValue) < 0;
  const hasUnstable = data.versions.some((v) => !v.stable);

  return (
    <div className="version-picker">
      <TucSelect id={id} value={value} options={options} placeholder="Padrão do servidor (mais recente)" onChange={onChange} />

      {hasUnstable && (
        <label className="version-toggle">
          <Toggle label="Mostrar versões de teste" checked={showUnstable} onChange={setShowUnstable} />
          <span className="muted small">Mostrar snapshots e pré-lançamentos</span>
        </label>
      )}

      {compat !== 'ok' && selected?.java && (
        <span className="version-note is-warning">
          {selected.id} precisa de Java {selected.java}, e a imagem atual usa Java {data.imageJava}. No <code>.env</code>, troque para{' '}
          <code>MC_IMAGE_TAG={imageTagFor(selected.java)}</code> e rode <code>make up</code>.
        </span>
      )}

      {isDowngrade && (
        <span className="version-note is-danger">
          Voltar de {savedValue} para {value}: o Minecraft não abre um mundo salvo numa versão mais nova. Restaure um backup dessa versão ou
          use outro mundo.
        </span>
      )}

      {!selected?.stable && selected && (
        <span className="version-note is-warning">Versão de teste: pode ter bugs, e plugins/mods costumam não suportar.</span>
      )}
    </div>
  );
}
