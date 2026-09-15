import { useEffect, useState } from 'react';
import type { GameRulesResponse } from '../../shared/api.ts';
import {
  GAMERULE_CATEGORIES,
  GAMERULES_BY_NAME,
  gameRuleText,
  validateGameRuleValue,
  type GameRuleCategory,
  type GameRuleDef,
} from '../../shared/gamerules.ts';
import { Icon } from '../components/icons.tsx';
import { EmptyState, Notice, Page, useAdvancedMode } from '../components/page.tsx';
import { SettingBlock } from '../components/SettingInput.tsx';
import { Badge, Button, Card, Input, SearchInput, Toggle, useToast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useApi } from '../lib/hooks.ts';
import { useMessages } from '../lib/i18n.tsx';
import { useWorld } from '../lib/world.tsx';
import './GameRules.css';

export function GameRulesPage() {
  const world = useWorld();
  const m = useMessages();
  const t = m.gamerules.page;
  // Mundo ligado: regras ao vivo pelo servidor. Guardado: as gravadas no mapa, só para ver.
  const { data, error, loading, reload } = useApi<GameRulesResponse>(world.ready ? world.path('/gamerules') : null);
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
      toast.success(t.changed(gameRuleText(rule.name, m).label, value));
    } catch (err) {
      setValues((v) => ({ ...v, [rule.name]: previous ?? '' }));
      toast.error(err);
    } finally {
      setSaving(undefined);
    }
  };

  const available = (data?.rules ?? []).map((r) => GAMERULES_BY_NAME.get(r.name)).filter((r): r is GameRuleDef => !!r);
  // A busca olha o nome na língua da tela e o nome técnico da regra.
  const term = search.trim().toLowerCase();
  const matching = available.filter((rule) => !term || gameRuleText(rule.name, m).label.toLowerCase().includes(term) || rule.name.includes(term));
  // Em cada categoria, liga/desliga primeiro e as de número por último.
  const byKind = (a: GameRuleDef, b: GameRuleDef) => Number(a.type === 'int') - Number(b.type === 'int');
  const categories = GAMERULE_CATEGORIES.map((c) => ({
    ...c,
    label: m.gamerules.categories[c.id],
    rules: matching.filter((r) => r.category === c.id).sort(byKind),
  })).filter((c) => c.rules.length > 0);
  const shown = category === 'all' ? categories : categories.filter((c) => c.id === category);
  const enabled = available.filter((r) => values[r.name] === 'true').length;

  return (
    <Page
      title={t.title}
      description={world.isActive ? t.descriptionActive : t.descriptionStored}
      actions={
        <Button onClick={reload} loading={loading && !!data}>
          <Icon name="refresh" /> {m.common.refresh}
        </Button>
      }
      loading={!data && !error}
      error={error ? (world.isActive ? t.serverOff : error.message) : undefined}
      onRetry={reload}
    >
      {data?.readOnly && (
        <Notice tone="info" title={t.storedTitle}>
          {t.storedText}
        </Notice>
      )}
      {data && (
        <>
          {/* Busca e categorias em cima, como os grupos de Configurações; cada categoria vira um cartão. */}
          <div className="rules-filter">
            <div className="rules-filter-top">
              <SearchInput placeholder={t.search} value={search} onValueChange={setSearch} />
              <span className="row muted small">
                {t.summary(available.length, enabled)}
                {advanced && <Badge plain>{data.naming === 'modern' ? t.namingModern : t.namingLegacy}</Badge>}
              </span>
            </div>
            <div className="chips" role="group" aria-label={t.categoriesAria}>
              <button type="button" className={`chip ${category === 'all' ? 'is-active' : ''}`} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
                {t.all} <span className="chip-count">{matching.length}</span>
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
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState icon="search" title={t.emptyTitle} text={term ? t.emptyText(search) : undefined} />
            </Card>
          ) : (
            shown.map((c) => (
              <Card key={c.id} title={c.label} description={t.count(c.rules.length)}>
                <div className="settings-grid">
                  {c.rules.map((rule) => (
                    <RuleBlock
                      key={rule.name}
                      rule={rule}
                      value={values[rule.name] ?? ''}
                      serverName={data.rules.find((r) => r.name === rule.name)!.serverName}
                      saving={saving === rule.name}
                      readOnly={!!data.readOnly}
                      onApply={(value) => apply(rule, value)}
                    />
                  ))}
                </div>
              </Card>
            ))
          )}
        </>
      )}
    </Page>
  );
}

function RuleBlock({
  rule,
  value,
  serverName,
  saving,
  readOnly,
  onApply,
}: {
  rule: GameRuleDef;
  value: string;
  serverName: string;
  saving: boolean;
  /** Mundo guardado: mostra o valor sem deixar mudar. */
  readOnly: boolean;
  onApply: (value: string) => void;
}) {
  const m = useMessages();
  const text = gameRuleText(rule.name, m);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const id = `rule-${rule.name}`;
  const error = rule.type === 'int' ? validateGameRuleValue(rule, draft, m) : null;

  if (rule.type === 'bool') {
    return (
      <SettingBlock
        label={text.label}
        help={text.help}
        technical={serverName}
        toggle={<Toggle label={text.label} checked={value === 'true'} disabled={saving || readOnly} onChange={(checked) => onApply(String(checked))} />}
      />
    );
  }

  return (
    <SettingBlock label={text.label} htmlFor={id} help={text.help} technical={serverName} error={error ?? undefined} highlight={draft !== value}>
      <form
        className="rules-number"
        onSubmit={(e) => {
          e.preventDefault();
          if (!error && draft !== value) onApply(draft);
        }}
      >
        <Input id={id} type="number" min={rule.min} max={rule.max} value={draft} invalid={!!error} disabled={readOnly} onChange={(e) => setDraft(e.target.value)} />
        {!readOnly && draft !== value && (
          <Button variant="primary" type="submit" loading={saving} disabled={!!error}>
            <Icon name="check" /> {m.common.apply}
          </Button>
        )}
      </form>
    </SettingBlock>
  );
}
