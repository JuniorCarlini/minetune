import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMERULE_CATEGORIES, GAMERULES, gameRuleText, validateGameRuleValue } from './gamerules.ts';
import { LOCALES, messages } from './i18n/index.ts';
import { SETTING_GROUPS, SETTINGS, SETTINGS_BY_KEY, fieldText, settingOptions, validateSetting } from './settings.ts';

// O TypeScript garante que as três línguas têm as mesmas chaves; isto garante que o catálogo
// e os textos andam juntos: configuração, opção ou regra nova sem texto aparece aqui.
test('toda configuração, opção, grupo e regra do catálogo tem texto nas três línguas', () => {
  for (const locale of LOCALES) {
    const m = messages(locale);
    const fields = m.settings.fields as Record<string, unknown>;
    for (const field of SETTINGS) {
      assert.ok(fields[field.key], `${locale}: sem texto para ${field.key}`);
      for (const option of field.options ?? []) {
        assert.ok(fieldText(field.key, m).options?.[option.value], `${locale}: ${field.key} sem texto para a opção ${option.value}`);
      }
      if (field.danger) assert.ok(fieldText(field.key, m).danger, `${locale}: ${field.key} tem risco mas não tem aviso`);
    }
    assert.deepEqual(Object.keys(fields).sort(), SETTINGS.map((f) => f.key).sort(), `${locale}: texto sobrando ou faltando`);
    for (const group of SETTING_GROUPS) assert.ok(m.settings.groups[group.id].label, `${locale}: grupo ${group.id}`);
    for (const category of GAMERULE_CATEGORIES) assert.ok(m.gamerules.categories[category.id], `${locale}: categoria ${category.id}`);
    for (const rule of GAMERULES) assert.notEqual(gameRuleText(rule.name, m).label, rule.name, `${locale}: sem texto para a regra ${rule.name}`);
  }
});

test('mensagens de validação saem na língua pedida, em português por padrão', () => {
  const players = SETTINGS_BY_KEY.get('MAX_PLAYERS')!;
  assert.equal(validateSetting(players, '0'), 'Mínimo 1');
  assert.equal(validateSetting(players, '0', messages('en')), 'Minimum 1');
  assert.equal(validateSetting(players, 'x', messages('es')), 'Tiene que ser un número entero');
  assert.equal(validateGameRuleValue(GAMERULES.find((r) => r.type === 'bool')!, 'talvez', messages('en')), 'Use true or false');
  assert.deepEqual(
    settingOptions('DIFFICULTY', messages('en')).map((o) => o.label),
    ['Peaceful', 'Easy', 'Normal', 'Hard'],
  );
});
