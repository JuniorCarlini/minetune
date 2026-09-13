import { useEffect, useState } from 'react';
import type { GameRulesResponse } from '../../shared/api.ts';
import { GAMERULE_CATEGORIES, GAMERULES_BY_NAME, validateGameRuleValue, type GameRuleDef } from '../../shared/gamerules.ts';
import { Icon } from '../components/icons.tsx';
import { Alert, Badge, Button, Card, Input, PageHeader, SearchInput, Spinner, Toggle, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';

export function GameRulesPage() {
  const { data, error, loading, reload } = useApi<GameRulesResponse>('/gamerules');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string>();
  const [search, setSearch] = useState('');
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
      toast.success(`${rule.label}: ${value === 'true' ? 'ativado' : value === 'false' ? 'desativado' : value}`);
    } catch (err) {
      setValues((v) => ({ ...v, [rule.name]: previous ?? '' }));
      toast.error(err);
    } finally {
      setSaving(undefined);
    }
  };

  const header = (
    <PageHeader
      title="Regras do jogo"
      description="Aplicadas na hora via /gamerule, em todas as dimensões. Ficam salvas no mundo."
      actions={
        <Button onClick={reload} loading={loading}>
          <Icon name="refresh" /> Recarregar
        </Button>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <Alert tone="warning" title="Servidor precisa estar online">
          As regras são lidas e alteradas diretamente no servidor em execução. ({error.message})
        </Alert>
      </>
    );
  }
  if (!data) return <Spinner />;

  const term = search.trim().toLowerCase();
  const rules = data.rules
    .map((r) => GAMERULES_BY_NAME.get(r.name)!)
    .filter((rule) => !term || rule.label.toLowerCase().includes(term) || rule.name.includes(term));
  const categories = GAMERULE_CATEGORIES.map((c) => ({ ...c, rules: rules.filter((r) => r.category === c.id) })).filter((c) => c.rules.length > 0);
  const enabled = data.rules.filter((r) => values[r.name] === 'true').length;

  return (
    <>
      {header}

      <div className="rules-toolbar">
        <SearchInput placeholder="Buscar regra por nome ou comando..." value={search} onValueChange={setSearch} />
        <div className="chips">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              onClick={() => document.getElementById(`rules-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {c.label} <span className="chip-count">{c.rules.length}</span>
            </button>
          ))}
        </div>
        <span className="row muted small">
          {data.rules.length} regras detectadas · {enabled} ativadas
          <Badge plain>{data.naming === 'modern' ? 'nomes 1.21.11+' : 'nomes legados'}</Badge>
        </span>
      </div>

      {categories.length === 0 && <Alert tone="info">Nenhuma regra encontrada para "{search}".</Alert>}

      {categories.map((category) => (
        <Card key={category.id} title={category.label}>
          <div id={`rules-${category.id}`} className="rule-grid">
            {category.rules.map((rule) => (
              <RuleTile
                key={rule.name}
                rule={rule}
                value={values[rule.name] ?? ''}
                serverName={data.rules.find((r) => r.name === rule.name)!.serverName}
                saving={saving === rule.name}
                onApply={(value) => apply(rule, value)}
              />
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

function RuleTile({
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
  const error = rule.type === 'int' ? validateGameRuleValue(rule, text) : null;
  const on = rule.type === 'bool' && value === 'true';

  const body = (
    <div className="rule-tile-info">
      <span className="rule-tile-label">{rule.label}</span>
      <code className="field-key">{serverName}</code>
      {rule.help && <span className="field-help">{rule.help}</span>}
    </div>
  );

  if (rule.type === 'bool') {
    return (
      <label className={`rule-tile ${on ? 'on' : ''} ${saving ? 'saving' : ''}`}>
        {body}
        <Toggle label={rule.label} checked={on} disabled={saving} onChange={(checked) => onApply(String(checked))} />
      </label>
    );
  }

  return (
    <div className={`rule-tile ${saving ? 'saving' : ''}`}>
      {body}
      <form
        className="rule-tile-number"
        onSubmit={(e) => {
          e.preventDefault();
          if (!error && text !== value) onApply(text);
        }}
      >
        <Input type="number" min={rule.min} max={rule.max} value={text} invalid={!!error} title={error ?? undefined} onChange={(e) => setText(e.target.value)} />
        {text !== value && (
          <Button size="sm" variant="primary" type="submit" loading={saving} disabled={!!error}>
            <Icon name="check" /> Aplicar
          </Button>
        )}
      </form>
    </div>
  );
}
