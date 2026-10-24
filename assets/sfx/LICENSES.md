# Licenças: efeitos sonoros

Importados em 2026-10-20 da biblioteca do editonny 1.0.0 (`visuals/library/effects/`), sem alterar os arquivos (SHA-256 em `index.json`). Nada foi baixado da internet.

Base da licença: cada item do `effects.json` do editonny traz `license: "CC0 1.0 (public domain)"`, autor e URL da página no Freesound; o `CREDITS.md` do editonny repete autor e fonte. A licença não foi conferida na página do Freesound de cada som (sem internet nesta importação).

Entraram 102 de 102 efeitos no índice. Nenhum ficou de fora.

Desde 1.6.0, só 15 vêm dentro do squad, como kit inicial e sem nenhuma alteração: os itens dos papéis (`whoosh-4`, `impact-2`, `riser-3`), o exemplo `swish-3` e o primeiro item de 11 categorias (lista em `kit` no `index.json`). Os outros 87 vêm com `bun lib/edit-engine/cli.ts library pull --sfx` do repositório público do editonny, fixado no commit `05d3dedcddcf6717001b0a3ef91411ec08f614d4`, nos caminhos do `effects/effects.json` dele, conferidos contra o SHA-256 do `index.json`, para `~/.nirvana/cache/editai/sfx/`, nunca para dentro do squad. / Since 1.6.0 the squad ships 15 unchanged effects; `library pull --sfx` downloads the other 87 from editonny at commit `05d3ded` into the cache, each checked against its SHA-256.

Os três `*-synth.wav` da raiz desta pasta foram sintetizados pelo próprio ffmpeg (`bun lib/edit-engine/cli.ts sfx-synth`) e são do squad. Viraram o fallback dos papéis `whoosh`, `hit` e `riser` (ver `roles` em `index.json`).

| Id | Nome | Categoria | Autor | Licença | Fonte |
|---|---|---|---|---|---|
| `cash-register-1` | Cash Register Purchase | cash-register | Zott820 | CC0 1.0 | https://freesound.org/people/Zott820/sounds/209578/ |
| `cash-register-2` | Cash Register Fake.wav | cash-register | CapsLok | CC0 1.0 | https://freesound.org/people/CapsLok/sounds/184438/ |
| `cash-register-3` | Cha Ching.wav | cash-register | deleted_user_96253 | CC0 1.0 | https://freesound.org/people/deleted_user_96253/sounds/351304/ |
| `cash-register-4` | Store Scanner Beep | cash-register | zerolagtime | CC0 1.0 | https://freesound.org/people/zerolagtime/sounds/144418/ |
| `cash-chaching-1` | cha ching 1.wav | cash-chaching | angelak_m | CC0 1.0 | https://freesound.org/people/angelak_m/sounds/132169/ |
| `question-huh-1` | Huh? - Vocal | question-huh | davdud101 | CC0 1.0 | https://freesound.org/people/davdud101/sounds/150505/ |
| `question-huh-2` | approving hm.wav | question-huh | trimono | CC0 1.0 | https://freesound.org/people/trimono/sounds/519112/ |
| `question-huh-3` | confused what? | question-huh | Alivvie | CC0 1.0 | https://freesound.org/people/Alivvie/sounds/323527/ |
| `question-hm-1` | Hmm question.wav | question-hm | esperar | CC0 1.0 | https://freesound.org/people/esperar/sounds/170768/ |
| `question-hm-2` | OneHmm-question.wav | question-hm | esperar | CC0 1.0 | https://freesound.org/people/esperar/sounds/170779/ |
| `question-hm-3` | 8bit Question Mark | question-hm | plasterbrain | CC0 1.0 | https://freesound.org/people/plasterbrain/sounds/399093/ |
| `question-hm-4` | question noise.wav | question-hm | AuDRoger | CC0 1.0 | https://freesound.org/people/AuDRoger/sounds/471205/ |
| `swish-1` | Whoosh | swish | qubodup | CC0 1.0 | https://freesound.org/people/qubodup/sounds/60013/ |
| `swish-2` | Sword.wav | swish | hello_flowers | CC0 1.0 | https://freesound.org/people/hello_flowers/sounds/37596/ |
| `swish-3` | SWOSH-01 44.1kHz | swish | qubodup | CC0 1.0 | https://freesound.org/people/qubodup/sounds/59988/ |
| `swish-4` | Swing Woosh | swish | Jofae | CC0 1.0 | https://freesound.org/people/Jofae/sounds/389590/ |
| `whoosh-1` | Woosh | whoosh | florianreichelt | CC0 1.0 | https://freesound.org/people/florianreichelt/sounds/683096/ |
| `whoosh-2` | fast simple chop 5.aif | whoosh | dave.des | CC0 1.0 | https://freesound.org/people/dave.des/sounds/127197/ |
| `whoosh-3` | Throwing / Whip Effect | whoosh | denao270 | CC0 1.0 | https://freesound.org/people/denao270/sounds/346373/ |
| `whoosh-4` | woosh.wav | whoosh | freakinbehemoth | CC0 1.0 | https://freesound.org/people/freakinbehemoth/sounds/243400/ |
| `title-swoosh-1` | swoosh | title-swoosh | Halgrimm | CC0 1.0 | https://freesound.org/people/Halgrimm/sounds/169867/ |
| `title-swoosh-2` | quick woosh | title-swoosh | florianreichelt | CC0 1.0 | https://freesound.org/people/florianreichelt/sounds/683101/ |
| `title-swoosh-3` | whoosh.wav | title-swoosh | LloydEvans09 | CC0 1.0 | https://freesound.org/people/LloydEvans09/sounds/332003/ |
| `title-swoosh-4` | Whoosh #1 | title-swoosh | Kinoton | CC0 1.0 | https://freesound.org/people/Kinoton/sounds/427823/ |
| `ding-1` | Ding Dong | ding | MatthewWong | CC0 1.0 | https://freesound.org/people/MatthewWong/sounds/361564/ |
| `ding-2` | Ringing bell - happy.wav | ding | domrodrig | CC0 1.0 | https://freesound.org/people/domrodrig/sounds/116779/ |
| `ding-3` | correct | ding | ertfelda | CC0 1.0 | https://freesound.org/people/ertfelda/sounds/243701/ |
| `ding-4` | bell ding 1.wav | ding | 5ro4 | CC0 1.0 | https://freesound.org/people/5ro4/sounds/611113/ |
| `notification-1` | Disco Clap | notification | NenadSimic | CC0 1.0 | https://freesound.org/people/NenadSimic/sounds/169085/ |
| `notification-2` | Lil Pip | notification | adh.dreaming | CC0 1.0 | https://freesound.org/people/adh.dreaming/sounds/634690/ |
| `notification-3` | Cow Bells 01.wav | notification | LilMati | CC0 1.0 | https://freesound.org/people/LilMati/sounds/481151/ |
| `notification-4` | Soft-Notifications - Bell - Ding-Dong.mp3 | notification | LegitCheese | CC0 1.0 | https://freesound.org/people/LegitCheese/sounds/571513/ |
| `success-1` | Correct.wav | correct | CogFireStudios | CC0 1.0 | https://freesound.org/people/CogFireStudios/sounds/421002/ |
| `success-2` | 8-bit Correct Answer | correct | JapanYoshiTheGamer | CC0 1.0 | https://freesound.org/people/JapanYoshiTheGamer/sounds/361263/ |
| `success-3` | Correct.wav | correct | bwg2020 | CC0 1.0 | https://freesound.org/people/bwg2020/sounds/456161/ |
| `success-4` | Correct Answer / That's Right! | correct | Beetlemuse | CC0 1.0 | https://freesound.org/people/Beetlemuse/sounds/528957/ |
| `mouth-pop-1` | Cartoon Pop (Distorted) | mouth-pop | unfa | CC0 1.0 | https://freesound.org/people/unfa/sounds/245646/ |
| `mouth-pop-2` | Message Pop Sound | mouth-pop | ImAFoley | CC0 1.0 | https://freesound.org/people/ImAFoley/sounds/537061/ |
| `mouth-pop-3` | Popping | mouth-pop | supersound23 | CC0 1.0 | https://freesound.org/people/supersound23/sounds/431532/ |
| `mouth-pop-4` | Pop Sound | mouth-pop | ConarB13 | CC0 1.0 | https://freesound.org/people/ConarB13/sounds/401542/ |
| `cork-pop-1` | Pop sound | cork-pop | deraj | CC0 1.0 | https://freesound.org/people/deraj/sounds/202230/ |
| `cork-pop-2` | Champagne Cork | cork-pop | KenRT | CC0 1.0 | https://freesound.org/people/KenRT/sounds/392624/ |
| `cork-pop-3` | Plop! | cork-pop | Breviceps | CC0 1.0 | https://freesound.org/people/Breviceps/sounds/447910/ |
| `cork-pop-4` | cartoon pop or drip | cork-pop | AlaskaRobotics | CC0 1.0 | https://freesound.org/people/AlaskaRobotics/sounds/221091/ |
| `bubble-pop-1` | Pop 01 | bubble-pop | LilMati | CC0 1.0 | https://freesound.org/people/LilMati/sounds/506546/ |
| `bubble-pop-2` | UI Button Click | bubble-pop | benzix2 | CC0 1.0 | https://freesound.org/people/benzix2/sounds/467951/ |
| `bubble-pop-3` | Pop 02 | bubble-pop | LilMati | CC0 1.0 | https://freesound.org/people/LilMati/sounds/506545/ |
| `pop-ui-1` | Mouth pop | pop-ui | jcallison | CC0 1.0 | https://freesound.org/people/jcallison/sounds/258269/ |
| `pop-ui-2` | Pop in sfx | pop-ui | Sadiquecat | CC0 1.0 | https://freesound.org/people/Sadiquecat/sounds/824189/ |
| `pop-ui-3` | The Best Bubble Pop Sound For Game and UI | pop-ui | el_boss | CC0 1.0 | https://freesound.org/people/el_boss/sounds/669918/ |
| `pop-ui-4` | Click Pop - two part | pop-ui | GameAudio | CC0 1.0 | https://freesound.org/people/GameAudio/sounds/220208/ |
| `photo-1` | iPhone Camera Capture.wav | photo | pooky1 | CC0 1.0 | https://freesound.org/people/pooky1/sounds/431588/ |
| `photo-2` | Camera Shutter | photo | roachpowder | CC0 1.0 | https://freesound.org/people/roachpowder/sounds/170229/ |
| `photo-3` | 350d shutter.wav | photo | xef6 | CC0 1.0 | https://freesound.org/people/xef6/sounds/61059/ |
| `photo-4` | iOS Camera flash | photo | Rvgerxini | CC0 1.0 | https://freesound.org/people/Rvgerxini/sounds/455511/ |
| `pencil-1` | Scribble | pencil | Tomoyo Ichijouji | CC0 1.0 | https://freesound.org/people/Tomoyo Ichijouji/sounds/211247/ |
| `pencil-2` | Scribble_short.wav | pencil | waldram | CC0 1.0 | https://freesound.org/people/waldram/sounds/257518/ |
| `pencil-3` | PEN SIGNATURE SIGNING 2.wav | pencil | ListenTonyBoy | CC0 1.0 | https://freesound.org/people/ListenTonyBoy/sounds/326961/ |
| `pencil-4` | Draw.wav | pencil | BitzHawk | CC0 1.0 | https://freesound.org/people/BitzHawk/sounds/524004/ |
| `pen-1` | Pencil Scribble (9) | pen | JellyDaisies | CC0 1.0 | https://freesound.org/people/JellyDaisies/sounds/761665/ |
| `pen-2` | scribble | pen | MasterSuite | CC0 1.0 | https://freesound.org/people/MasterSuite/sounds/667399/ |
| `pen-3` | scribbling.aif | pen | joseph.larralde | CC0 1.0 | https://freesound.org/people/joseph.larralde/sounds/352430/ |
| `chalk-1` | Write/Draw with chalk on board | chalk | Breviceps | CC0 1.0 | https://freesound.org/people/Breviceps/sounds/447925/ |
| `chalk-2` | Chalk.wav | chalk | LukeUPF | CC0 1.0 | https://freesound.org/people/LukeUPF/sounds/233049/ |
| `chalk-3` | writing - chalk - set down 01.wav | chalk | Anthousai | CC0 1.0 | https://freesound.org/people/Anthousai/sounds/398489/ |
| `chalk-4` | drawing with chalk 01 | chalk | _sinny_ | CC0 1.0 | https://freesound.org/people/_sinny_/sounds/822704/ |
| `typing-1` | Mouse click sounds | typing | Masgame | CC0 1.0 | https://freesound.org/people/Masgame/sounds/347544/ |
| `typing-2` | digital_typing.wav | typing | Sky_Motion | CC0 1.0 | https://freesound.org/people/Sky_Motion/sounds/416777/ |
| `typing-3` | Data Reveal Sound | typing | Sky_Motion | CC0 1.0 | https://freesound.org/people/Sky_Motion/sounds/511418/ |
| `typing-4` | Keyboard typing | typing | Breviceps | CC0 1.0 | https://freesound.org/people/Breviceps/sounds/447909/ |
| `click-1` | mouse-click-double-00.flac | click | pbimal | CC0 1.0 | https://freesound.org/people/pbimal/sounds/534104/ |
| `click-2` | Normal click | click | Breviceps | CC0 1.0 | https://freesound.org/people/Breviceps/sounds/448086/ |
| `click-3` | Button Tick | click | NenadSimic | CC0 1.0 | https://freesound.org/people/NenadSimic/sounds/268108/ |
| `clock-2` | Ticking Clock | clock | AntumDeluge | CC0 1.0 | https://freesound.org/people/AntumDeluge/sounds/188033/ |
| `clock-3` | Ticking Stopwatch (dry) | clock | DavidJGurney | CC0 1.0 | https://freesound.org/people/DavidJGurney/sounds/275802/ |
| `clock-4` | ticking of the clock 02.wav | clock | blukotek | CC0 1.0 | https://freesound.org/people/blukotek/sounds/412750/ |
| `timer-1` | Countdown Start | timer | stomachache | CC0 1.0 | https://freesound.org/people/stomachache/sounds/680825/ |
| `timer-2` | stopwatch beep.wav | timer | vestibule-door | CC0 1.0 | https://freesound.org/people/vestibule-door/sounds/668985/ |
| `timer-3` | Synthetic Shot Timer | timer | AnthonyChan0 | CC0 1.0 | https://freesound.org/people/AnthonyChan0/sounds/447761/ |
| `riser-1` | Riser sound effect short.wav | riser | syntheffects | CC0 1.0 | https://freesound.org/people/syntheffects/sounds/685256/ |
| `riser-2` | Energy Bounce 1 | riser | magnuswaker | CC0 1.0 | https://freesound.org/people/magnuswaker/sounds/523088/ |
| `riser-3` | Riser | riser | Rizzard | CC0 1.0 | https://freesound.org/people/Rizzard/sounds/561207/ |
| `riser-4` | sweep.wav | riser | reathance | CC0 1.0 | https://freesound.org/people/reathance/sounds/503815/ |
| `sparkle-1` | cartoon_wink_magic_sparkle.wav | sparkle | MLaudio | CC0 1.0 | https://freesound.org/people/MLaudio/sounds/511485/ |
| `sparkle-2` | Heal - Rpg | sparkle | colorsCrimsonTears | CC0 1.0 | https://freesound.org/people/colorsCrimsonTears/sounds/562292/ |
| `sparkle-3` | achievement-sparkle | sparkle | SkySpeira | CC0 1.0 | https://freesound.org/people/SkySpeira/sounds/715067/ |
| `sparkle-4` | Sparkling Star 01.wav | sparkle | LilMati | CC0 1.0 | https://freesound.org/people/LilMati/sounds/462095/ |
| `impact-1` | PUNCH-BOXING-03.wav | impact | newagesoup | CC0 1.0 | https://freesound.org/people/newagesoup/sounds/348242/ |
| `impact-2` | Sub Drop Smooth.wav | impact | newagesoup | CC0 1.0 | https://freesound.org/people/newagesoup/sounds/428073/ |
| `impact-3` | PUNCH-BOXING-02.wav | impact | newagesoup | CC0 1.0 | https://freesound.org/people/newagesoup/sounds/348243/ |
| `impact-4` | Synth Bass Drop Impact | impact | AlexLane | CC0 1.0 | https://freesound.org/people/AlexLane/sounds/475005/ |
| `glitch-1` | Glitch | glitch | AmicaSys | CC0 1.0 | https://freesound.org/people/AmicaSys/sounds/332711/ |
| `glitch-2` | snapcracklepop.wav | glitch | dayvonjersen | CC0 1.0 | https://freesound.org/people/dayvonjersen/sounds/156340/ |
| `glitch-3` | glitch096.wav | glitch | syn2x-v0 | CC0 1.0 | https://freesound.org/people/syn2x-v0/sounds/2314/ |
| `glitch-4` | Bleep | glitch | Posontic | CC0 1.0 | https://freesound.org/people/Posontic/sounds/429677/ |
| `message-1` | Message Sent | message | Froey_ | CC0 1.0 | https://freesound.org/people/Froey_/sounds/760370/ |
| `message-2` | Chatton.mp3 | message | Kastenfrosch | CC0 1.0 | https://freesound.org/people/Kastenfrosch/sounds/113986/ |
| `message-3` | Message sound.wav | message | Sunart1 | CC0 1.0 | https://freesound.org/people/Sunart1/sounds/592772/ |
| `soft-error-1` | negativebeep.wav | soft-error | Splashdust | CC0 1.0 | https://freesound.org/people/Splashdust/sounds/67454/ |
| `soft-error-2` | acess denied buzz | soft-error | Jacco18 | CC0 1.0 | https://freesound.org/people/Jacco18/sounds/419023/ |
| `soft-error-3` | Error Signal 2 | soft-error | Breviceps | CC0 1.0 | https://freesound.org/people/Breviceps/sounds/445978/ |
| `soft-error-4` | Sci-fi Warning Beep | soft-error | JapanYoshiTheGamer | CC0 1.0 | https://freesound.org/people/JapanYoshiTheGamer/sounds/361247/ |

---

# Licenses: sound effects (EN)

Imported on 2026-10-20 from the editonny 1.0.0 library, files unchanged, nothing downloaded. Every item of editonny's `effects.json` carries `license: "CC0 1.0 (public domain)"`, the author and the Freesound URL. Not re-checked on each Freesound page. The three `*-synth.wav` files are synthesized by this squad and are the fallback for the `whoosh`, `hit` and `riser` roles.
