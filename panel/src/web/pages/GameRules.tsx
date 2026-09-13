import { useEffect, useState } from 'react';
import type { GameRulesResponse } from '../../shared/api.ts';
import { GAMERULE_CATEGORIES, GAMERULES_BY_NAME, validateGameRuleValue, type GameRuleCategory, type GameRuleDef } from '../../shared/gamerules.ts';
import { Icon } from '../components/icons.tsx';
import { EmptyState, OptionRow, Page, useAdvancedMode } from '../components/page.tsx';
import { Badge, Button, Card, Input, SearchInput, Toggle, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import './GameRules.css';

export function GameRulesPage() {
  const { data, error, loading, reload } = useApi<GameRulesResponse>('/gamerules');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<GameRuleCategory | 'all'>('all');
  const [advanced] = useAdvancedMode();
  const toast = useToast();

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.rules.map((r) => [r.name, r.value])));
  }, [data]);

  const apply = async (rule: GameRuleDef, value: string) => {
    const previous = values[rule.name];
    setValues((v) => ({ ...v, [rule.name]: value }));
    setSaving(rule.name);
    try {
      await api.put(`/gamerules/${rule.name}`, { value });
      toast.success(`${rule.label}: ${value === 'true' ? 'ligada' : value === 'false' ? 'desligada' : value}`);
    } catch (err) {
      setValues((v) => ({ ...v, [rule.name]: previous ?? '' }));
      toast.error(err);
    } finally {
      setSaving(undefined);
    }
  };

  const available = (data?.rules ?? []).map((r) => GAMERULES_BY_NAME.get(r.name)).filter((r): r is GameRuleDef => !!r);
  const term = search.trim().toLowerCase();
  const matching = available.filter((rule) => !term || rule.label.toLowerCase().includes(term) || rule.name.includes(term));
  const categories = GAMERULE_CATEGORIES.map((c) => ({ ...c, rules: matching.filter((r) => r.category === c.id) })).filter((c) => c.rules.length > 0);
  const shown = category === 'all' ? categories : categories.filter((c) => c.id === category);
  const enabled = available.filter((r) => values[r.name] === 'true').length;

  return (
    <Page
      title="Regras do jogo"
      description="Mudam na hora, para todo mundo, sem reiniciar."
      actions={
        <Button onClick={reload} loading={loading && !!data}>
          <Icon name="refresh" /> Atualizar
        </Button>
      }
      loading={!data && !error}
      error={error ? 'O servidor precisa estar ligado para ler e mudar as regras.' : undefined}
      onRetry={reload}
    >
      {data && (
        <Card>
          <div className="rules-filter">
            <SearchInput placeholder="Buscar regra…" value={search} onValueChange={setSearch} />
            <div className="chips" role="group" aria-label="Categorias">
              <button type="button" className={`chip ${category === 'all' ? 'is-active' : ''}`} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
                Todas <span className="chip-count">{matching.length}</span>
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip ${category === c.id ? 'is-active' : ''}`}
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label} <span className="chip-count">{c.rules.length}</span>
                </button>
              ))}
            </div>
            <span className="row muted small">
              {available.length} regras · {enabled} ligadas
              {advanced && <Badge plain>{data.naming === 'modern' ? 'nomes 1.21.11+' : 'nomes legados'}</Badge>}
            </span>
          </div>

          {shown.length === 0 ? (
            <EmptyState icon="search" title="Nenhuma regra encontrada" text={term ? `Nada com "${search}". Tente outra palavra.` : undefined} />
          ) : (
            shown.map((c) => (
              <section key={c.id}>
                <h3 className="rules-category">{c.label}</h3>
                {c.rules.map((rule) => (
                  <RuleRow
                    key={rule.name}
                    rule={rule}
                    value={values[rule.name] ?? ''}
                    serverName={data.rules.find((r) => r.name === rule.name)!.serverName}
                    saving={saving === rule.name}
                    onApply={(value) => apply(rule, value)}
                  />
                ))}
              </section>
            ))
          )}
        </Card>
      )}
    </Page>
  );
}

function RuleRow({
  rule,
  value,
  serverName,
  saving,
  onApply,
}: {
  rule: GameRuleDef;
  value: string;
  serverName: string;
  saving: boolean;
  onApply: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const id = `rule-${rule.name}`;
  const error = rule.type === 'int' ? validateGameRuleValue(rule, text) : null;

  const control =
    rule.type === 'bool' ? (
      <Toggle label={rule.label} checked={value === 'true'} disabled={saving} onChange={(checked) => onApply(String(checked))} />
    ) : (
      <form
        className="rules-number"
        onSubmit={(e) => {
          e.preventDefault();
          if (!error && text !== value) onApply(text);
        }}
      >
        <Input id={id} type="number" min={rule.min} max={rule.max} value={text} invalid={!!error} onChange={(e) => setText(e.target.value)} />
        {text !== value && (
          <Button size="sm" variant="primary" type="submit" loading={saving} disabled={!!error}>
            <Icon name="check" /> Aplicar
          </Button>
        )}
      </form>
    );

  return (
    <OptionRow
      htmlFor={rule.type === 'int' ? id : undefined}
      title={rule.label}
      description={rule.help}
      technical={serverName}
      error={error ?? undefined}
      highlight={rule.type === 'int' && text !== value}
      control={control}
    />
  );
}
