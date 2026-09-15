import { defineMessages } from './define.ts';

/** Nome e ajuda de uma regra do catálogo (shared/gamerules.ts). */
export interface GameRuleText {
  label: string;
  help?: string;
}

/** Regras do jogo: categorias, cada regra (pelo nome snake_case) e a tela. */
export const gamerules = defineMessages(
  {
    categories: {
      players: 'Jogadores',
      mobs: 'Criaturas',
      spawning: 'Spawn de criaturas',
      world: 'Mundo e clima',
      drops: 'Drops',
      chat: 'Chat e mensagens',
      misc: 'Comandos e diversos',
    },
    rules: {
      keep_inventory: {
        label: 'Manter inventário ao morrer',
        help: 'Ligado, quem morre renasce com todos os itens e a experiência. Desligado, tudo cai no chão.',
      },
      immediate_respawn: { label: 'Renascer sem tela de morte', help: 'Ligado, o jogador renasce na hora, sem passar pela tela de morte.' },
      natural_health_regeneration: {
        label: 'Regeneração natural de vida',
        help: 'Ligado, a vida volta sozinha quando a barra de fome está cheia. Desligado, só poções, maçãs douradas e parecidos curam.',
      },
      pvp: { label: 'PvP entre jogadores', help: 'Ligado, jogadores podem causar dano uns aos outros.' },
      fall_damage: { label: 'Dano de queda', help: 'Ligado, cair de lugares altos tira vida.' },
      fire_damage: { label: 'Dano de fogo e lava', help: 'Ligado, fogo e lava tiram vida.' },
      drowning_damage: { label: 'Dano de afogamento', help: 'Ligado, ficar sem ar debaixo d’água tira vida.' },
      freeze_damage: { label: 'Dano de congelamento (neve fofa)', help: 'Ligado, ficar dentro de neve fofa congela o jogador e tira vida.' },
      players_sleeping_percentage: {
        label: 'Jogadores dormindo para pular a noite (%)',
        help: 'Porcentagem dos jogadores online que precisa estar dormindo para a noite passar. Padrão 100; 0 basta um jogador.',
      },
      respawn_radius: {
        label: 'Raio de renascimento ao redor do spawn',
        help: 'Distância, em blocos, em volta do spawn onde aparece quem entra pela primeira vez ou morre sem cama. Padrão 10.',
      },
      limited_crafting: { label: 'Só fabricar receitas desbloqueadas', help: 'Ligado, os jogadores só fabricam o que já desbloquearam no livro de receitas.' },
      locator_bar: { label: 'Barra de localização de jogadores', help: 'Ligado, a barra de experiência mostra a direção dos outros jogadores por perto.' },
      ender_pearls_vanish_on_death: {
        label: 'Pérolas do End somem quando o jogador morre',
        help: 'Ligado, as pérolas do End que um jogador lançou somem quando ele morre.',
      },
      spectators_generate_chunks: {
        label: 'Espectadores geram chunks',
        help: 'Ligado, jogadores no modo espectador carregam e geram partes novas do mapa. Desligar alivia o servidor.',
      },
      allow_entering_nether_using_portals: { label: 'Entrar no Nether por portais', help: 'Desligado, os portais do Nether não levam ninguém para lá.' },
      players_nether_portal_default_delay: {
        label: 'Espera no portal do Nether (ticks)',
        help: 'Quanto tempo o jogador precisa ficar dentro do portal para ser levado. 20 ticks = 1 segundo; padrão 80 (4 segundos).',
      },
      players_nether_portal_creative_delay: {
        label: 'Espera no portal no criativo (ticks)',
        help: 'O mesmo tempo de espera, para quem está no modo criativo. 20 ticks = 1 segundo.',
      },
      player_movement_check: {
        label: 'Anticheat de velocidade de movimento',
        help: 'Ligado, o servidor corrige quem se move rápido demais. Desligar reduz puxões com lag, mas deixa passar trapaças de velocidade.',
      },
      elytra_movement_check: {
        label: 'Anticheat de velocidade com elytra',
        help: 'Ligado, o servidor corrige quem voa de elytra rápido demais. Desligar reduz puxões com lag.',
      },
      mob_griefing: {
        label: 'Criaturas alteram blocos (creeper, enderman...)',
        help: 'Ligado, criaturas mudam o mundo: creepers destroem blocos, endermen carregam blocos e aldeões colhem plantações. Desligado, nada disso acontece.',
      },
      raids: { label: 'Invasões (raids)', help: 'Ligado, entrar numa vila com o efeito Mau Presságio começa uma invasão de saqueadores.' },
      forgive_dead_players: {
        label: 'Criaturas neutras perdoam jogador morto',
        help: 'Ligado, criaturas neutras irritadas param de atacar quando o jogador que as provocou morre.',
      },
      universal_anger: {
        label: 'Raiva de criaturas neutras contra todos',
        help: 'Ligado, criaturas neutras irritadas atacam qualquer jogador por perto, não só quem as provocou.',
      },
      max_entity_cramming: {
        label: 'Máximo de entidades empilhadas antes de sofrer dano',
        help: 'Quantas criaturas cabem no mesmo espaço antes de começarem a se machucar pelo aperto. Padrão 24; 0 desativa.',
      },
      spawn_mobs: {
        label: 'Spawn natural de criaturas',
        help: 'Ligado, animais e monstros aparecem sozinhos pelo mundo. Desligado, só por ovos, spawners ou comandos.',
      },
      spawn_monsters: { label: 'Spawn natural de monstros', help: 'Ligado, monstros aparecem sozinhos no escuro. Desligado, só criaturas pacíficas aparecem.' },
      spawn_phantoms: { label: 'Phantoms (insônia)', help: 'Ligado, phantoms atacam à noite quem passa três dias ou mais sem dormir.' },
      spawn_patrols: { label: 'Patrulhas de saqueadores', help: 'Ligado, patrulhas de saqueadores aparecem pelo mundo.' },
      spawn_wandering_traders: { label: 'Vendedor ambulante', help: 'Ligado, o vendedor ambulante e suas lhamas aparecem de vez em quando perto dos jogadores.' },
      spawn_wardens: { label: 'Wardens', help: 'Ligado, o warden surge quando alguém faz barulho demais perto dos blocos de sculk, como nas Cidades Ancestrais.' },
      spawner_blocks_work: { label: 'Spawners funcionam', help: 'Ligado, os spawners criam criaturas. Desligado, ficam parados.' },
      advance_time: { label: 'Ciclo de dia e noite', help: 'Ligado, o dia e a noite passam normalmente. Desligado, o horário fica parado.' },
      advance_weather: { label: 'Mudança de clima', help: 'Ligado, chuva e tempestade vêm e vão sozinhas. Desligado, o clima atual fica fixo.' },
      random_tick_speed: { label: 'Velocidade de ticks aleatórios', help: 'Crescimento de plantas, espalhamento de fogo... Padrão 3.' },
      fire_spread_radius_around_player: { label: 'Raio de propagação do fogo ao redor dos jogadores', help: '0 impede o fogo de se espalhar.' },
      spread_vines: { label: 'Trepadeiras se espalham', help: 'Ligado, trepadeiras crescem e se espalham sozinhas pelos blocos.' },
      water_source_conversion: {
        label: 'Formar novas fontes de água',
        help: 'Ligado, água corrente entre duas fontes vira uma fonte nova, o jeito de fazer água infinita.',
      },
      lava_source_conversion: {
        label: 'Formar novas fontes de lava',
        help: 'Ligado, lava corrente entre duas fontes vira uma fonte nova, como acontece com a água. Padrão desligado.',
      },
      max_snow_accumulation_height: {
        label: 'Camadas máximas de neve acumulada',
        help: 'Quantas camadas de neve podem se acumular num bloco enquanto neva. Padrão 1.',
      },
      tnt_explodes: { label: 'TNT explode', help: 'Desligado, a TNT não explode.' },
      projectiles_can_break_blocks: {
        label: 'Projéteis quebram blocos',
        help: 'Ligado, flechas e outros projéteis quebram blocos frágeis, como potes decorados e flores do coro.',
      },
      block_drops: { label: 'Blocos dropam itens', help: 'Ligado, blocos quebrados soltam seus itens. Desligado, somem sem deixar nada.' },
      mob_drops: { label: 'Criaturas dropam itens e XP', help: 'Ligado, criaturas mortas soltam itens e experiência.' },
      entity_drops: {
        label: 'Entidades (carrinhos, molduras...) dropam itens',
        help: 'Ligado, carrinhos, barcos, molduras e suportes de armadura quebrados soltam o item.',
      },
      block_explosion_drop_decay: {
        label: 'Explosões de blocos perdem parte dos drops',
        help: 'Ligado, explosões causadas por blocos, como camas no Nether, destroem parte dos itens que os blocos atingidos soltariam.',
      },
      mob_explosion_drop_decay: {
        label: 'Explosões de criaturas perdem parte dos drops',
        help: 'Ligado, explosões de criaturas, como creepers, destroem parte dos itens que os blocos atingidos soltariam.',
      },
      tnt_explosion_drop_decay: {
        label: 'Explosões de TNT perdem parte dos drops',
        help: 'Ligado, explosões de TNT destroem parte dos itens que os blocos atingidos soltariam. Padrão desligado.',
      },
      show_death_messages: { label: 'Mensagens de morte', help: 'Ligado, o chat avisa quando alguém morre e como.' },
      show_advancement_messages: { label: 'Anunciar conquistas', help: 'Ligado, o chat avisa quando alguém ganha uma conquista.' },
      send_command_feedback: { label: 'Retorno de comandos no chat', help: 'Ligado, quem usa um comando vê a resposta dele no chat.' },
      command_block_output: { label: 'Blocos de comando notificam operadores', help: 'Ligado, operadores veem no chat o que os blocos de comando fazem.' },
      log_admin_commands: {
        label: 'Registrar comandos de administradores',
        help: 'Ligado, os comandos de um operador aparecem para os outros operadores e ficam no registro do servidor.',
      },
      command_blocks_work: { label: 'Blocos de comando funcionam', help: 'Ligado, blocos de comando executam seus comandos. Desligado, ficam parados.' },
      reduced_debug_info: { label: 'Ocultar coordenadas no F3', help: 'Ligado, a tela F3 esconde as coordenadas e outras informações detalhadas.' },
      global_sound_events: {
        label: 'Sons de chefes audíveis em todo o mundo',
        help: 'Ligado, sons como o do Wither nascendo e do dragão do End morrendo são ouvidos por todos, em qualquer lugar.',
      },
      max_block_modifications: { label: 'Blocos por /fill e /clone', help: 'Quantos blocos um único /fill ou /clone pode mudar de uma vez. Padrão 32.768.' },
      max_command_sequence_length: {
        label: 'Tamanho máximo de cadeia de comandos',
        help: 'Quantos comandos uma função ou uma sequência de blocos de comando pode executar de uma vez. Padrão 65.536.',
      },
      max_command_forks: {
        label: 'Máximo de contextos por comando',
        help: 'Quantas execuções um único comando pode abrir, por exemplo com @e ou execute. Padrão 65.536.',
      },
      max_minecart_speed: {
        label: 'Velocidade máxima de carrinhos (experimental)',
        help: 'Velocidade máxima dos carrinhos nos trilhos, em blocos por segundo. Só vale com o recurso experimental de carrinhos ligado. Padrão 8.',
      },
    } satisfies Record<string, GameRuleText>,
    page: {
      title: 'Regras do jogo',
      descriptionActive: 'Mudam na hora, para todo mundo, sem reiniciar.',
      descriptionStored: 'As regras gravadas no mapa deste mundo.',
      serverOff: 'O servidor precisa estar ligado para ler e mudar as regras.',
      storedTitle: 'Regras guardadas neste mundo',
      storedText: 'Estas são as regras gravadas no mapa. Para mudar alguma, ligue este mundo pelo card do topo.',
      search: 'Buscar regra…',
      summary: (total: number, enabled: number) => `${total} regras · ${enabled} ligadas`,
      namingModern: 'nomes 1.21.11+',
      namingLegacy: 'nomes legados',
      all: 'Todas',
      categoriesAria: 'Categorias',
      emptyTitle: 'Nenhuma regra encontrada',
      emptyText: (query: string) => `Nada com "${query}". Tente outra palavra.`,
      count: (n: number) => `${n} ${n === 1 ? 'regra' : 'regras'}`,
      changed: (label: string, value: string) => `${label}: ${value === 'true' ? 'ligada' : value === 'false' ? 'desligada' : value}`,
    },
  },
  {
    en: {
      categories: {
        players: 'Players',
        mobs: 'Mobs',
        spawning: 'Mob spawning',
        world: 'World and weather',
        drops: 'Drops',
        chat: 'Chat and messages',
        misc: 'Commands and misc',
      },
      rules: {
        keep_inventory: {
          label: 'Keep inventory after death',
          help: 'On, players respawn with all their items and experience. Off, everything drops on the ground.',
        },
        immediate_respawn: { label: 'Respawn immediately', help: 'On, players respawn right away, skipping the death screen.' },
        natural_health_regeneration: {
          label: 'Natural health regeneration',
          help: 'On, health comes back on its own while the hunger bar is full. Off, only potions, golden apples and the like heal.',
        },
        pvp: { label: 'PvP between players', help: 'On, players can damage each other.' },
        fall_damage: { label: 'Fall damage', help: 'On, falling from high places hurts.' },
        fire_damage: { label: 'Fire and lava damage', help: 'On, fire and lava hurt.' },
        drowning_damage: { label: 'Drowning damage', help: 'On, running out of air underwater hurts.' },
        freeze_damage: { label: 'Freeze damage (powder snow)', help: 'On, standing inside powder snow freezes the player and hurts.' },
        players_sleeping_percentage: {
          label: 'Players sleeping to skip the night (%)',
          help: 'Percentage of online players who must be asleep for the night to pass. Default 100; 0 means one player is enough.',
        },
        respawn_radius: {
          label: 'Respawn radius around spawn',
          help: 'Distance, in blocks, around the spawn where new players and players who die without a bed appear. Default 10.',
        },
        limited_crafting: { label: 'Only craft unlocked recipes', help: 'On, players can only craft what they have unlocked in the recipe book.' },
        locator_bar: { label: 'Player locator bar', help: 'On, the experience bar shows the direction of other nearby players.' },
        ender_pearls_vanish_on_death: {
          label: 'Ender pearls vanish when the player dies',
          help: 'On, ender pearls a player has thrown disappear when that player dies.',
        },
        spectators_generate_chunks: {
          label: 'Spectators generate chunks',
          help: 'On, players in Spectator mode load and generate new parts of the map. Turning it off eases the server.',
        },
        allow_entering_nether_using_portals: { label: 'Enter the Nether through portals', help: 'Off, Nether portals don’t take anyone there.' },
        players_nether_portal_default_delay: {
          label: 'Nether portal wait (ticks)',
          help: 'How long a player must stand in the portal before being taken. 20 ticks = 1 second; default 80 (4 seconds).',
        },
        players_nether_portal_creative_delay: {
          label: 'Nether portal wait in Creative (ticks)',
          help: 'The same wait, for players in Creative mode. 20 ticks = 1 second.',
        },
        player_movement_check: {
          label: 'Movement speed anti-cheat',
          help: 'On, the server corrects players who move too fast. Turning it off reduces lag rubber-banding but lets speed cheats through.',
        },
        elytra_movement_check: {
          label: 'Elytra speed anti-cheat',
          help: 'On, the server corrects players flying too fast with elytra. Turning it off reduces lag rubber-banding.',
        },
        mob_griefing: {
          label: 'Mobs change blocks (creeper, enderman...)',
          help: 'On, mobs change the world: creepers destroy blocks, endermen pick blocks up and villagers harvest crops. Off, none of that happens.',
        },
        raids: { label: 'Raids', help: 'On, entering a village with the Bad Omen effect starts a pillager raid.' },
        forgive_dead_players: {
          label: 'Neutral mobs forgive dead players',
          help: 'On, angry neutral mobs stop attacking when the player who provoked them dies.',
        },
        universal_anger: {
          label: 'Neutral mobs get angry at everyone',
          help: 'On, angry neutral mobs attack any nearby player, not only the one who provoked them.',
        },
        max_entity_cramming: {
          label: 'Max stacked entities before taking damage',
          help: 'How many mobs can share the same space before they start taking cramming damage. Default 24; 0 turns it off.',
        },
        spawn_mobs: {
          label: 'Natural mob spawning',
          help: 'On, animals and monsters appear on their own in the world. Off, only from spawn eggs, spawners or commands.',
        },
        spawn_monsters: { label: 'Natural monster spawning', help: 'On, monsters appear on their own in the dark. Off, only peaceful mobs appear.' },
        spawn_phantoms: { label: 'Phantoms (insomnia)', help: 'On, phantoms attack at night players who go three days or more without sleeping.' },
        spawn_patrols: { label: 'Pillager patrols', help: 'On, pillager patrols appear around the world.' },
        spawn_wandering_traders: { label: 'Wandering trader', help: 'On, the wandering trader and its llamas show up near players from time to time.' },
        spawn_wardens: { label: 'Wardens', help: 'On, the warden emerges when someone makes too much noise near sculk shriekers, like in Ancient Cities.' },
        spawner_blocks_work: { label: 'Spawners work', help: 'On, spawners create mobs. Off, they stay idle.' },
        advance_time: { label: 'Day and night cycle', help: 'On, day and night pass normally. Off, the time of day stays frozen.' },
        advance_weather: { label: 'Weather changes', help: 'On, rain and thunderstorms come and go on their own. Off, the current weather stays.' },
        random_tick_speed: { label: 'Random tick speed', help: 'Plant growth, fire spread... Default 3.' },
        fire_spread_radius_around_player: { label: 'Fire spread radius around players', help: '0 stops fire from spreading.' },
        spread_vines: { label: 'Vines spread', help: 'On, vines grow and spread across blocks on their own.' },
        water_source_conversion: {
          label: 'Form new water sources',
          help: 'On, flowing water between two sources becomes a new source, which is how infinite water works.',
        },
        lava_source_conversion: {
          label: 'Form new lava sources',
          help: 'On, flowing lava between two sources becomes a new source, just like water. Off by default.',
        },
        max_snow_accumulation_height: { label: 'Max snow layers', help: 'How many snow layers can pile up on a block while it snows. Default 1.' },
        tnt_explodes: { label: 'TNT explodes', help: 'Off, TNT doesn’t explode.' },
        projectiles_can_break_blocks: {
          label: 'Projectiles break blocks',
          help: 'On, arrows and other projectiles break fragile blocks, such as decorated pots and chorus flowers.',
        },
        block_drops: { label: 'Blocks drop items', help: 'On, broken blocks drop their items. Off, they vanish without dropping anything.' },
        mob_drops: { label: 'Mobs drop items and XP', help: 'On, killed mobs drop items and experience.' },
        entity_drops: {
          label: 'Entities (minecarts, item frames...) drop items',
          help: 'On, broken minecarts, boats, item frames and armor stands drop their item.',
        },
        block_explosion_drop_decay: {
          label: 'Block explosions lose some drops',
          help: 'On, explosions caused by blocks, such as beds in the Nether, destroy some of the items the blocks hit would drop.',
        },
        mob_explosion_drop_decay: {
          label: 'Mob explosions lose some drops',
          help: 'On, explosions from mobs, such as creepers, destroy some of the items the blocks hit would drop.',
        },
        tnt_explosion_drop_decay: {
          label: 'TNT explosions lose some drops',
          help: 'On, TNT explosions destroy some of the items the blocks hit would drop. Off by default.',
        },
        show_death_messages: { label: 'Death messages', help: 'On, chat announces when someone dies and how.' },
        show_advancement_messages: { label: 'Announce advancements', help: 'On, chat announces when someone earns an advancement.' },
        send_command_feedback: { label: 'Command feedback in chat', help: 'On, whoever runs a command sees its response in chat.' },
        command_block_output: { label: 'Command blocks notify operators', help: 'On, operators see in chat what command blocks do.' },
        log_admin_commands: {
          label: 'Log admin commands',
          help: 'On, an operator’s commands are shown to the other operators and saved in the server log.',
        },
        command_blocks_work: { label: 'Command blocks work', help: 'On, command blocks run their commands. Off, they stay idle.' },
        reduced_debug_info: { label: 'Hide coordinates in F3', help: 'On, the F3 screen hides coordinates and other detailed information.' },
        global_sound_events: {
          label: 'Boss sounds heard across the world',
          help: 'On, sounds such as the Wither spawning and the Ender Dragon dying are heard by everyone, anywhere.',
        },
        max_block_modifications: { label: 'Blocks per /fill and /clone', help: 'How many blocks a single /fill or /clone can change at once. Default 32,768.' },
        max_command_sequence_length: {
          label: 'Max command chain length',
          help: 'How many commands a function or a chain of command blocks can run at once. Default 65,536.',
        },
        max_command_forks: {
          label: 'Max contexts per command',
          help: 'How many executions a single command can branch into, for example with @e or execute. Default 65,536.',
        },
        max_minecart_speed: {
          label: 'Max minecart speed (experimental)',
          help: 'Top speed of minecarts on rails, in blocks per second. Only applies with the experimental minecart feature on. Default 8.',
        },
      },
      page: {
        title: 'Game rules',
        descriptionActive: 'They change instantly, for everyone, without a restart.',
        descriptionStored: 'The rules saved in this world’s map.',
        serverOff: 'The server needs to be on to read and change the rules.',
        storedTitle: 'Rules saved in this world',
        storedText: 'These are the rules saved in the map. To change one, turn this world on from the card at the top.',
        search: 'Search rules…',
        summary: (total: number, enabled: number) => `${total} rules · ${enabled} on`,
        namingModern: '1.21.11+ names',
        namingLegacy: 'legacy names',
        all: 'All',
        categoriesAria: 'Categories',
        emptyTitle: 'No rules found',
        emptyText: (query: string) => `Nothing matches "${query}". Try another word.`,
        count: (n: number) => `${n} ${n === 1 ? 'rule' : 'rules'}`,
        changed: (label: string, value: string) => `${label}: ${value === 'true' ? 'on' : value === 'false' ? 'off' : value}`,
      },
    },
    es: {
      categories: {
        players: 'Jugadores',
        mobs: 'Criaturas',
        spawning: 'Aparición de criaturas',
        world: 'Mundo y clima',
        drops: 'Botín',
        chat: 'Chat y mensajes',
        misc: 'Comandos y otros',
      },
      rules: {
        keep_inventory: {
          label: 'Conservar el inventario al morir',
          help: 'Activada, quien muere reaparece con todos sus objetos y experiencia. Desactivada, todo cae al suelo.',
        },
        immediate_respawn: { label: 'Reaparecer sin pantalla de muerte', help: 'Activada, el jugador reaparece al instante, sin pasar por la pantalla de muerte.' },
        natural_health_regeneration: {
          label: 'Regeneración natural de vida',
          help: 'Activada, la vida se recupera sola cuando la barra de hambre está llena. Desactivada, solo curan pociones, manzanas doradas y similares.',
        },
        pvp: { label: 'PvP entre jugadores', help: 'Activada, los jugadores pueden hacerse daño entre sí.' },
        fall_damage: { label: 'Daño por caída', help: 'Activada, caer desde lugares altos quita vida.' },
        fire_damage: { label: 'Daño por fuego y lava', help: 'Activada, el fuego y la lava quitan vida.' },
        drowning_damage: { label: 'Daño por ahogamiento', help: 'Activada, quedarse sin aire bajo el agua quita vida.' },
        freeze_damage: { label: 'Daño por congelación (nieve polvo)', help: 'Activada, estar dentro de nieve polvo congela al jugador y quita vida.' },
        players_sleeping_percentage: {
          label: 'Jugadores durmiendo para saltar la noche (%)',
          help: 'Porcentaje de jugadores conectados que tiene que estar durmiendo para que pase la noche. Predeterminado 100; con 0 basta un jugador.',
        },
        respawn_radius: {
          label: 'Radio de reaparición alrededor del spawn',
          help: 'Distancia, en bloques, alrededor del spawn donde aparecen los jugadores nuevos y quienes mueren sin cama. Predeterminado 10.',
        },
        limited_crafting: {
          label: 'Solo fabricar recetas desbloqueadas',
          help: 'Activada, los jugadores solo pueden fabricar lo que ya desbloquearon en el libro de recetas.',
        },
        locator_bar: { label: 'Barra de localización de jugadores', help: 'Activada, la barra de experiencia muestra la dirección de los demás jugadores cercanos.' },
        ender_pearls_vanish_on_death: {
          label: 'Las perlas de ender desaparecen al morir el jugador',
          help: 'Activada, las perlas de ender que lanzó un jugador desaparecen cuando ese jugador muere.',
        },
        spectators_generate_chunks: {
          label: 'Los espectadores generan chunks',
          help: 'Activada, los jugadores en modo espectador cargan y generan zonas nuevas del mapa. Desactivarla alivia el servidor.',
        },
        allow_entering_nether_using_portals: { label: 'Entrar al Nether por portales', help: 'Desactivada, los portales del Nether no llevan a nadie allí.' },
        players_nether_portal_default_delay: {
          label: 'Espera en el portal del Nether (ticks)',
          help: 'Cuánto tiempo tiene que estar el jugador dentro del portal para ser llevado. 20 ticks = 1 segundo; predeterminado 80 (4 segundos).',
        },
        players_nether_portal_creative_delay: {
          label: 'Espera en el portal en Creativo (ticks)',
          help: 'El mismo tiempo de espera, para quien está en modo creativo. 20 ticks = 1 segundo.',
        },
        player_movement_check: {
          label: 'Antitrampas de velocidad de movimiento',
          help: 'Activada, el servidor corrige a quien se mueve demasiado rápido. Desactivarla reduce los tirones por lag, pero deja pasar trampas de velocidad.',
        },
        elytra_movement_check: {
          label: 'Antitrampas de velocidad con élitros',
          help: 'Activada, el servidor corrige a quien vuela demasiado rápido con élitros. Desactivarla reduce los tirones por lag.',
        },
        mob_griefing: {
          label: 'Las criaturas alteran bloques (creeper, enderman...)',
          help: 'Activada, las criaturas cambian el mundo: los creepers destruyen bloques, los endermen cogen bloques y los aldeanos cosechan cultivos. Desactivada, nada de eso pasa.',
        },
        raids: { label: 'Invasiones (raids)', help: 'Activada, entrar en una aldea con el efecto Mal presagio inicia una invasión de saqueadores.' },
        forgive_dead_players: {
          label: 'Las criaturas neutrales perdonan al jugador muerto',
          help: 'Activada, las criaturas neutrales enfadadas dejan de atacar cuando muere el jugador que las provocó.',
        },
        universal_anger: {
          label: 'Ira de criaturas neutrales contra todos',
          help: 'Activada, las criaturas neutrales enfadadas atacan a cualquier jugador cercano, no solo a quien las provocó.',
        },
        max_entity_cramming: {
          label: 'Máximo de entidades amontonadas antes de recibir daño',
          help: 'Cuántas criaturas caben en el mismo espacio antes de empezar a hacerse daño por aplastamiento. Predeterminado 24; 0 lo desactiva.',
        },
        spawn_mobs: {
          label: 'Aparición natural de criaturas',
          help: 'Activada, los animales y monstruos aparecen solos por el mundo. Desactivada, solo con huevos, generadores o comandos.',
        },
        spawn_monsters: {
          label: 'Aparición natural de monstruos',
          help: 'Activada, los monstruos aparecen solos en la oscuridad. Desactivada, solo aparecen criaturas pacíficas.',
        },
        spawn_phantoms: { label: 'Phantoms (insomnio)', help: 'Activada, los phantoms atacan de noche a quien pasa tres días o más sin dormir.' },
        spawn_patrols: { label: 'Patrullas de saqueadores', help: 'Activada, aparecen patrullas de saqueadores por el mundo.' },
        spawn_wandering_traders: {
          label: 'Comerciante nómada',
          help: 'Activada, el comerciante nómada y sus llamas aparecen de vez en cuando cerca de los jugadores.',
        },
        spawn_wardens: {
          label: 'Wardens',
          help: 'Activada, el warden surge cuando alguien hace demasiado ruido cerca de los chilladores de sculk, como en las Ciudades Antiguas.',
        },
        spawner_blocks_work: { label: 'Los generadores funcionan', help: 'Activada, los generadores crean criaturas. Desactivada, se quedan quietos.' },
        advance_time: { label: 'Ciclo de día y noche', help: 'Activada, el día y la noche pasan con normalidad. Desactivada, la hora se queda detenida.' },
        advance_weather: { label: 'Cambio de clima', help: 'Activada, la lluvia y las tormentas vienen y se van solas. Desactivada, el clima actual se mantiene.' },
        random_tick_speed: { label: 'Velocidad de ticks aleatorios', help: 'Crecimiento de plantas, propagación del fuego... Predeterminado 3.' },
        fire_spread_radius_around_player: {
          label: 'Radio de propagación del fuego alrededor de los jugadores',
          help: '0 impide que el fuego se propague.',
        },
        spread_vines: { label: 'Las enredaderas se extienden', help: 'Activada, las enredaderas crecen y se extienden solas por los bloques.' },
        water_source_conversion: {
          label: 'Formar nuevas fuentes de agua',
          help: 'Activada, el agua que fluye entre dos fuentes se convierte en una fuente nueva, que es como funciona el agua infinita.',
        },
        lava_source_conversion: {
          label: 'Formar nuevas fuentes de lava',
          help: 'Activada, la lava que fluye entre dos fuentes se convierte en una fuente nueva, igual que el agua. Desactivada por defecto.',
        },
        max_snow_accumulation_height: {
          label: 'Capas máximas de nieve acumulada',
          help: 'Cuántas capas de nieve se pueden acumular en un bloque mientras nieva. Predeterminado 1.',
        },
        tnt_explodes: { label: 'La dinamita explota', help: 'Desactivada, la dinamita no explota.' },
        projectiles_can_break_blocks: {
          label: 'Los proyectiles rompen bloques',
          help: 'Activada, las flechas y otros proyectiles rompen bloques frágiles, como vasijas decoradas y flores coral.',
        },
        block_drops: { label: 'Los bloques sueltan objetos', help: 'Activada, los bloques rotos sueltan sus objetos. Desactivada, desaparecen sin soltar nada.' },
        mob_drops: { label: 'Las criaturas sueltan objetos y experiencia', help: 'Activada, las criaturas muertas sueltan objetos y experiencia.' },
        entity_drops: {
          label: 'Las entidades (vagonetas, marcos...) sueltan objetos',
          help: 'Activada, las vagonetas, botes, marcos y soportes para armaduras rotos sueltan su objeto.',
        },
        block_explosion_drop_decay: {
          label: 'Las explosiones de bloques pierden parte del botín',
          help: 'Activada, las explosiones causadas por bloques, como las camas en el Nether, destruyen parte de los objetos que soltarían los bloques alcanzados.',
        },
        mob_explosion_drop_decay: {
          label: 'Las explosiones de criaturas pierden parte del botín',
          help: 'Activada, las explosiones de criaturas, como los creepers, destruyen parte de los objetos que soltarían los bloques alcanzados.',
        },
        tnt_explosion_drop_decay: {
          label: 'Las explosiones de dinamita pierden parte del botín',
          help: 'Activada, las explosiones de dinamita destruyen parte de los objetos que soltarían los bloques alcanzados. Desactivada por defecto.',
        },
        show_death_messages: { label: 'Mensajes de muerte', help: 'Activada, el chat avisa cuando alguien muere y cómo.' },
        show_advancement_messages: { label: 'Anunciar logros', help: 'Activada, el chat avisa cuando alguien consigue un logro.' },
        send_command_feedback: { label: 'Respuesta de comandos en el chat', help: 'Activada, quien usa un comando ve su respuesta en el chat.' },
        command_block_output: {
          label: 'Los bloques de comandos avisan a los operadores',
          help: 'Activada, los operadores ven en el chat lo que hacen los bloques de comandos.',
        },
        log_admin_commands: {
          label: 'Registrar comandos de administradores',
          help: 'Activada, los comandos de un operador se muestran a los demás operadores y quedan en el registro del servidor.',
        },
        command_blocks_work: { label: 'Los bloques de comandos funcionan', help: 'Activada, los bloques de comandos ejecutan sus comandos. Desactivada, se quedan quietos.' },
        reduced_debug_info: { label: 'Ocultar coordenadas en F3', help: 'Activada, la pantalla F3 oculta las coordenadas y otra información detallada.' },
        global_sound_events: {
          label: 'Sonidos de jefes audibles en todo el mundo',
          help: 'Activada, sonidos como la aparición del Wither y la muerte del dragón del End los oyen todos, en cualquier lugar.',
        },
        max_block_modifications: {
          label: 'Bloques por /fill y /clone',
          help: 'Cuántos bloques puede cambiar de una vez un solo /fill o /clone. Predeterminado 32.768.',
        },
        max_command_sequence_length: {
          label: 'Longitud máxima de cadena de comandos',
          help: 'Cuántos comandos puede ejecutar de una vez una función o una cadena de bloques de comandos. Predeterminado 65.536.',
        },
        max_command_forks: {
          label: 'Máximo de contextos por comando',
          help: 'Cuántas ejecuciones puede abrir un solo comando, por ejemplo con @e o execute. Predeterminado 65.536.',
        },
        max_minecart_speed: {
          label: 'Velocidad máxima de vagonetas (experimental)',
          help: 'Velocidad máxima de las vagonetas en los raíles, en bloques por segundo. Solo se aplica con la función experimental de vagonetas activada. Predeterminado 8.',
        },
      },
      page: {
        title: 'Reglas del juego',
        descriptionActive: 'Cambian al instante, para todos, sin reiniciar.',
        descriptionStored: 'Las reglas guardadas en el mapa de este mundo.',
        serverOff: 'El servidor tiene que estar encendido para leer y cambiar las reglas.',
        storedTitle: 'Reglas guardadas en este mundo',
        storedText: 'Estas son las reglas guardadas en el mapa. Para cambiar alguna, enciende este mundo desde la tarjeta de arriba.',
        search: 'Buscar regla…',
        summary: (total: number, enabled: number) => `${total} reglas · ${enabled} activadas`,
        namingModern: 'nombres 1.21.11+',
        namingLegacy: 'nombres antiguos',
        all: 'Todas',
        categoriesAria: 'Categorías',
        emptyTitle: 'No se encontró ninguna regla',
        emptyText: (query: string) => `Nada con "${query}". Prueba otra palabra.`,
        count: (n: number) => `${n} ${n === 1 ? 'regla' : 'reglas'}`,
        changed: (label: string, value: string) => `${label}: ${value === 'true' ? 'activada' : value === 'false' ? 'desactivada' : value}`,
      },
    },
  },
);
