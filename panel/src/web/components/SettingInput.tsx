import { useState, type ReactNode } from 'react';
import { fieldText, settingOptions, type SettingField } from '../../shared/settings.ts';
import { formatBytes } from '../lib/format.ts';
import { useMessages } from '../lib/i18n.tsx';
import { Badge, HelpTip, Input, TucSelect, Toggle } from './ui.tsx';
import { VersionPicker } from './VersionPicker.tsx';
import './setting-input.css';

/**
 * Bloco de uma opção: nome, "?" com a explicação e o campo embaixo. Interruptores ficam na
 * linha do nome. Usado em Configurações (dois por linha) e em Criar mundo.
 */
export function SettingBlock({
  label,
  htmlFor,
  help,
  badges,
  toggle,
  error,
  highlight,
  technical,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  badges?: ReactNode;
  /** Interruptor: vai na linha do nome, à direita. */
  toggle?: ReactNode;
  error?: string;
  highlight?: boolean;
  technical?: string;
  children?: ReactNode;
}) {
  return (
    <div className={['setting-field', highlight ? 'is-dirty' : '', error ? 'is-invalid' : ''].filter(Boolean).join(' ')}>
      <div className="setting-field-head">
        {htmlFor ? (
          <label className="setting-field-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="setting-field-label">{label}</span>
        )}
        <HelpTip text={help} technical={technical} />
        {badges}
        {toggle && <span className="setting-field-switch">{toggle}</span>}
      </div>
      {children && <div className="setting-field-control">{children}</div>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

const GIB = 1024 ** 3;
/** Mesma folga que o servidor exige fora da heap (JVM_OVERHEAD_BYTES em routes.ts). */
const JVM_OVERHEAD_BYTES = 768 * 1024 ** 2;

/** "4G" → "4", "3072M" → "3". Valor vazio ou fora do formato fica vazio (padrão do servidor). */
function memoryToGb(value: string): string {
  const match = value.trim().match(/^(\d+)([MG])$/i);
  if (!match) return '';
  const amount = Number(match[1]);
  return String(match[2]!.toUpperCase() === 'G' ? amount : Math.max(1, Math.round(amount / 1024)));
}

/** Uma configuração do catálogo (shared/settings.ts) com o campo certo para o tipo dela. */
export function SettingInput({
  field,
  value,
  dirty = false,
  error,
  memoryLimit,
  serverType,
  savedValue = '',
  onChange,
}: {
  field: SettingField;
  value: string;
  dirty?: boolean;
  error?: string;
  memoryLimit?: number;
  serverType: string;
  savedValue?: string;
  onChange: (value: string) => void;
}) {
  const m = useMessages();
  const t = m.settings.input;
  const text = fieldText(field.key, m);
  const id = `setting-${field.key}`;
  const [showUnstable, setShowUnstable] = useState(false);
  let control: ReactNode;
  let headerToggle: ReactNode;

  switch (field.type) {
    case 'boolean':
      control = (
        <span className="row">
          {value === '' && <span className="muted small">{m.common.serverDefault}</span>}
          {/* Sem valor salvo, mostra o que o servidor usa: Nether e estruturas vêm ligados no Minecraft. */}
          <Toggle label={text.label} checked={(value || field.serverDefault) === 'true'} onChange={(checked) => onChange(String(checked))} />
        </span>
      );
      break;
    case 'select':
      control = <TucSelect id={id} value={value} options={settingOptions(field, m)} placeholder={t.selectDefault} onChange={onChange} />;
      break;
    case 'version':
      control = (
        <VersionPicker id={id} serverType={serverType} value={value} savedValue={savedValue} invalid={!!error} onChange={onChange} showUnstable={showUnstable} />
      );
      // Na linha do nome, como os outros interruptores: embaixo do select ele ficava perdido.
      headerToggle = (
        <label className="setting-field-inline">
          <span className="muted small">{t.testVersions}</span>
          <Toggle label={t.showUnstable} checked={showUnstable} onChange={setShowUnstable} />
        </label>
      );
      break;
    case 'memory': {
      // Só o número de GB: "4G" no server.env aparece como 4, e o que se digita volta como "4G".
      const maxGb = memoryLimit ? Math.max(1, Math.floor((memoryLimit - JVM_OVERHEAD_BYTES) / GIB)) : undefined;
      control = (
        <div className="memory-input">
          <div className="memory-input-row">
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={maxGb}
              step={1}
              placeholder={text.placeholder ?? m.common.serverDefault}
              value={memoryToGb(value)}
              invalid={!!error}
              onKeyDown={(e) => {
                // Campo numérico aceita "e", "+", "-" e ",": aqui só dígitos fazem sentido.
                if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault();
              }}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '');
                onChange(digits ? `${digits}G` : '');
              }}
            />
            <span className="memory-input-unit">GB</span>
          </div>
          {maxGb && <span className="field-help">{t.memoryMax(maxGb)}</span>}
        </div>
      );
      break;
    }
    default:
      control = (
        <Input
          id={id}
          type={field.type === 'number' ? 'number' : 'text'}
          inputMode={field.type === 'number' ? 'numeric' : undefined}
          min={field.min}
          max={field.max}
          placeholder={text.placeholder ?? m.common.serverDefault}
          value={value}
          invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  // A explicação sai da linha e vai para o "?": a tela fica limpa e quem quer saber mais abre a dica.
  const help = [text.help, memoryLimit ? t.memoryLimit(formatBytes(memoryLimit)) : null, text.danger ? t.dangerNote(text.danger) : null]
    .filter(Boolean)
    .join(' ');
  const isSwitch = field.type === 'boolean';

  return (
    <SettingBlock
      label={text.label}
      htmlFor={isSwitch ? undefined : id}
      help={help || undefined}
      technical={field.key}
      highlight={dirty}
      error={error}
      toggle={isSwitch ? control : headerToggle}
      // O risco fica no "?" (texto "Atenção: …") e na confirmação ao salvar; a etiqueta só poluía.
      badges={
        dirty && (
          <Badge tone="info" plain>
            {t.changed}
          </Badge>
        )
      }
    >
      {isSwitch ? undefined : control}
    </SettingBlock>
  );
}
