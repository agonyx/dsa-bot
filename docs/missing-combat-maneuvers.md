# Missing Combat Maneuvers (Kampfsonderfertigkeiten)

Combat maneuvers from DSA Regelwiki not yet in the main reference. Excludes regional/school-specific Kampfstilsonderfertigkeiten.

---

## Basismanöver (Basic Maneuvers)

### Präziser Stich I-III (Precise Thrust)

- type: Basismanöver
- techniques: Dolche, Fächer, Fechtwaffen
- ap cost: 15/20/25

#### Stufe I

- at penalty: -2
- effect: +2 TP on success
- prerequisites: GE 13

#### Stufe II

- at penalty: -4
- effect: +4 TP on success
- prerequisites: GE 15, Präziser Stich I

#### Stufe III

- at penalty: -6
- effect: +6 TP on success
- prerequisites: GE 17, Präziser Stich II

---

## Passive Combat Special Abilities

### Einhändiger Kampf (One-Handed Fighting)

- type: Passive
- effect: +1 AT, +1 PA, +1 TP when fighting with single one-handed weapon (no shield, parry weapon, or second weapon)
- prerequisites: GE 13
- techniques: Dolche, Fächer, Fechtwaffen, Hiebwaffen, Schwerter
- ap cost: 10

### Feindgespür (Enemy Sense)

- type: Passive
- effect: +2 INI in first combat round when both sides were unaware of each other
- prerequisites: IN 13
- techniques: All
- ap cost: 10

### Belastungsgewöhnung I-II (Load Tolerance)

- type: Passive
- effect: Reduce BE penalty by 1 per level for movement/INI (not skill tests)
- techniques: All
- ap cost: 10/15

#### Stufe I

- prerequisites: KO 13

#### Stufe II

- prerequisites: KO 15, Belastungsgewöhnung I

### Meister der improvisierten Waffen (Master of Improvised Weapons)

- type: Passive
- effect: No penalty for using improvised weapons; +1 TP with improvised weapons
- prerequisites: KK 13, Raufen 4
- techniques: All improvised weapons
- ap cost: 15

### Machtvolle Meisterparade (Powerful Masterful Parry)

- type: Passive
- effect: Meisterparade works with two-handed weapons; when parrying two-handed, successful parry deals 1W3 TP to attacker
- prerequisites: MU 15, Meisterparade
- techniques: Zweihandhiebwaffen, Zweihandschwerter
- ap cost: 20

### Meisterlicher Klingentänzer (Masterful Blade Dancer)

- type: Passive
- effect: Klingentänzer initiative bonus is +1W6+2 (instead of +1W6)
- prerequisites: IN 17, GE 17, Klingentänzer
- techniques: All
- ap cost: 30

### Meisterliche Geschossabwehr I-III (Masterful Projectile Defense)

- type: Passive
- techniques: Raufen
- ap cost: 10/15/20

#### Stufe I

- effect: Geschossabwehr works against bow/crossbow arrows at -4 penalty
- prerequisites: FF 15, Geschossabwehr III

#### Stufe II

- effect: Geschossabwehr works against bow/crossbow arrows at -2 penalty
- prerequisites: FF 17, Meisterliche Geschossabwehr I

#### Stufe III

- effect: Geschossabwehr works against bow/crossbow arrows at 0 penalty
- prerequisites: FF 17, Meisterliche Geschossabwehr II

---

## Spezialmanöver (Special Maneuvers)

### Grappling Chain (Raufen)

#### Wurf (Throw)

- type: Spezialmanöver
- at penalty: -2
- damage: 1W3 TP
- effect: Throw grappled target prone (Status: Liegend)
- prerequisites: GE 13, Haltegriff
- techniques: Raufen
- ap cost: 10

Note: Target must already be in Haltegriff. If throw succeeds, target gains Status: Liegend.

#### Schwitzkasten (Headlock)

- type: Spezialmanöver
- at penalty: 0
- effect: Target takes 1 SP per KR and must roll Selbstbeherrschung (Handlungsfähigkeit bewahren) -1 or gain 1 Stufe Betäubung
- escape: Comparative Kraftakt (Ziehen & Zerren) test to break free
- prerequisites: KK 13, Haltegriff
- techniques: Raufen
- ap cost: 10

Note: While in Schwitzkasten, target has Status: Fixiert and Eingeengt. Attacker cannot defend while maintaining hold.

#### Grätsche (Tackle)

- type: Spezialmanöver
- at penalty: -2
- damage: 1W3 TP
- effect: Target must roll Körperbeherrschung (Kampfmanöver) or gain Status: Liegend
- prerequisites: GE 13
- techniques: Raufen
- ap cost: 10

#### Blutgrätsche (Bloody Tackle)

- type: Spezialmanöver
- at penalty: -2
- damage: 1W3 TP (bleeding)
- effect: Like Grätsche, but TP are bleeding damage
- prerequisites: GE 15, Grätsche
- techniques: Raufen
- ap cost: 20

#### Ellbogenangriff I-III (Elbow Strike)

- type: Spezialmanöver
- damage: 1W3 TP
- effect: Can be used while grappled (Fixiert/Eingeengt)
- techniques: Raufen
- ap cost: 10/15/20

##### Stufe I

- at penalty: -2
- prerequisites: KK 13

##### Stufe II

- at penalty: -1
- prerequisites: KK 15, Ellbogenangriff I

##### Stufe III

- at penalty: 0
- prerequisites: KK 17, Ellbogenangriff II

#### Durchgezogener Tritt I-III (Follow-up Kick)

- type: Spezialmanöver
- damage: 1W6 TP
- effect: After successful Raufen attack, immediate kick as free action
- techniques: Raufen
- ap cost: 10/15/20

##### Stufe I

- at penalty: -2
- prerequisites: GE 13

##### Stufe II

- at penalty: -1
- prerequisites: GE 15, Durchgezogener Tritt I

##### Stufe III

- at penalty: 0
- prerequisites: GE 17, Durchgezogener Tritt II

---

### Shield Maneuvers

#### Schildschlag (Shield Bash)

- type: Spezialmanöver
- at modifier: +2
- damage: Double shield TP +0/+1/+2 (small/medium/large shield)
- restriction: Target must have Status: Liegend
- prerequisites: KK 15
- techniques: Schilde
- ap cost: 5

Note: Can also be used with other heavy objects (counts as small shield).

#### Schildspalter (Shield Splitter)

- type: Spezialmanöver
- at penalty: ±0
- effect: Attack enemy shield directly; damage goes to Structure Points instead of LE; at 0 SP, shield is destroyed
- defense: Target can defend with shield PA (no shield bonus) or Ausweichen
- prerequisites: KK 13, Wuchtschlag I
- techniques: Hiebwaffen, Kettenwaffen, Zweihandhiebwaffen, Zweihandschwerter
- ap cost: 15

---

### Ranged Combat Maneuvers

#### Eisenhagel I-II (Hail of Iron)

- type: Spezialmanöver
- at penalty: 0 (first), -2 (second), -4 (third)
- effect: Throw 2 (I) or 3 (II) thrown weapons at once; same target only; 1 action to ready all
- restriction: Max 0.5 Stone weight per weapon; Patzer ends further attacks this KR
- techniques: Diskusse (Stufe I only), Wurfwaffen
- ap cost: 15/20

##### Stufe I

- prerequisites: FF 15, Schnellladen (Wurfwaffen)

##### Stufe II

- prerequisites: FF 17, Eisenhagel I

#### Verteilter Eisenhagel (Distributed Hail of Iron)

- type: Spezialmanöver
- at penalty: -2 per target
- effect: Like Eisenhagel but can target different enemies
- prerequisites: FF 17, Eisenhagel II
- techniques: Wurfwaffen
- ap cost: 25

#### Kernschuss I-III (Core Shot)

- type: Spezialmanöver
- techniques: Bögen, Armbrüste
- ap cost: 15/20/25

##### Stufe I

- at penalty: -2
- effect: +1 TP on success
- prerequisites: FF 13

##### Stufe II

- at penalty: -4
- effect: +2 TP on success
- prerequisites: FF 15, Kernschuss I

##### Stufe III

- at penalty: -6
- effect: +3 TP on success
- prerequisites: FF 17, Kernschuss II

#### Querschuss I-III (Ricochet Shot)

- type: Spezialmanöver
- effect: Shoot around cover; ignore cover penalty
- techniques: Bögen, Armbrüste
- ap cost: 15/20/25

##### Stufe I

- at penalty: -2
- prerequisites: FF 13

##### Stufe II

- at penalty: -4
- prerequisites: FF 15, Querschuss I

##### Stufe III

- at penalty: -6
- prerequisites: FF 17, Querschuss II

#### Gezielter Schuss (Aimed Shot)

- type: Spezialmanöver (requires Fokusregel: Trefferzonen)
- fk penalty: See Trefferzonen below
- effect: Target specific body locations
- prerequisites: GE 13
- techniques: Bögen, Armbrüste, Wurfwaffen
- ap cost: 10

##### Trefferzonen FK Penalties (Humanoid, small to large)

- kopf (head): -10
- torso: -4
- arme (arms): -8
- beine (legs): -8

##### Modifiers

- target with status überrascht: penalty reduced by 2
- with gezielter schuss sf: penalties halved (rounded up)
- note: These penalties replace size category modifiers

#### Schnellladen (Quick Load)

- type: Passive
- effect: Reduce reload time by 1 action (minimum 1)
- prerequisites: FF 13
- techniques: Bögen, Armbrüste, Wurfwaffen
- ap cost: 15

#### Weitwurf (Long Throw)

- type: Spezialmanöver
- at penalty: -2
- effect: +50% range on thrown weapons
- prerequisites: FF 13
- techniques: Wurfwaffen
- ap cost: 10

#### Kraftvoller Speerwurf (Powerful Spear Throw)

- type: Spezialmanöver
- at penalty: -2
- effect: +3 TP on spear throw
- prerequisites: KK 13
- techniques: Wurfwaffen (Speere only)
- ap cost: 15

#### Betäubungswurf (Stunning Throw)

- type: Spezialmanöver
- at penalty: -2
- damage: 1W3 TP
- effect: Target must roll KO×3 or gain 1 Stufe Betäubung
- prerequisites: KK 13
- techniques: Wurfwaffen
- ap cost: 15

#### Armbrust überdrehen (Overcrank Crossbow)

- type: Passive
- effect: +1 range category but reload time +1 action
- prerequisites: FF 13
- techniques: Armbrüste
- ap cost: 10

#### Harpunieren (Harpooning)

- type: Spezialmanöver
- at penalty: -2
- effect: Harpoon/spear attaches to target; can prevent escape or pull target
- prerequisites: FF 13
- techniques: Wurfwaffen (harpoons/spears)
- ap cost: 15

---

### Two-Handed Weapon Maneuvers

#### Zweihandwaffen-Kampf (Two-Handed Weapon Fighting)

- type: Passive
- effect: Can use two-handed weapons with -2 AT penalty in one hand (if KK high enough)
- prerequisites: KK 15
- techniques: Zweihandhiebwaffen, Zweihandschwerter
- ap cost: 20

#### Zweihandwaffen-Doppelschlag (Two-Handed Double Strike)

- type: Spezialmanöver
- at penalty: -4 first AT, -8 second AT
- effect: Two attacks with same two-handed weapon in one action
- prerequisites: KK 15, Zweihandwaffen-Kampf
- techniques: Zweihandhiebwaffen, Zweihandschwerter
- ap cost: 25

---

### Defensive/Utility Maneuvers

#### Unterlaufen I-II (Duck Under)

- type: Spezialmanöver
- effect: Duck under large weapons to get inside reach; avoid Passierschlag from reach weapons
- techniques: All
- ap cost: 15/20

##### Stufe I

- at penalty: -4
- prerequisites: GE 13

##### Stufe II

- at penalty: -2
- prerequisites: GE 15, Unterlaufen I

#### Verbessertes Unterlaufen (Improved Duck Under)

- type: Passive
- effect: Unterlaufen works against all reach weapons, not just large
- prerequisites: GE 17, Unterlaufen II
- techniques: All
- ap cost: 15

#### Kreuzblock (Cross Block)

- type: Passive
- effect: Can use two parrying weapons together; +1 PA when doing so
- prerequisites: GE 13, Beidhändiger Kampf I
- techniques: Parrying weapons
- ap cost: 15

#### Klinge drehen (Blade Turn)

- type: Spezialmanöver
- pa penalty: -2
- effect: After successful parry, redirect enemy blade to bypass their next defense
- prerequisites: GE 15
- techniques: Dolche, Fechtwaffen, Schwerter
- ap cost: 20

#### Festnageln (Pinning)

- type: Spezialmanöver
- at penalty: -4
- effect: Pin enemy's weapon or clothing to wall/ground; target must succeed Kraftakt to free
- prerequisites: KK 13
- techniques: Stangenwaffen, Speere
- ap cost: 15

#### Umwickeln (Entangle)

- type: Spezialmanöver
- at penalty: -4
- effect: Wrap whip around enemy weapon; comparative probe to disarm
- prerequisites: GE 13
- techniques: Peitschen
- ap cost: 20

#### Auf Distanz halten I-II (Keep at Distance)

- type: Spezialmanöver
- effect: Prevent enemy from entering engagement distance; Passierschlag if they try
- techniques: Stangenwaffen, Speere
- ap cost: 15/20

##### Stufe I

- at penalty: -2
- prerequisites: GE 13

##### Stufe II

- at penalty: -4
- prerequisites: GE 15, Auf Distanz halten I

---

### Mounted/Aerial Combat

#### Reißangriff (Slashing Attack)

- type: Spezialmanöver
- at penalty: -2
- effect: Quick slash while passing (mounted or flying); +2 TP from momentum
- prerequisites: GE 13
- techniques: Schwerter
- ap cost: 15

#### Auflaufen (Boarding)

- type: Spezialmanöver
- at penalty: -2
- effect: Board enemy ship/vehicle; grants first action in following KR
- prerequisites: GE 13
- techniques: All
- ap cost: 10

#### Herunterstoßen (Knock Down)

- type: Spezialmanöver
- at penalty: -4
- effect: Knock mounted/flying enemy to ground; falling damage applies
- prerequisites: KK 13
- techniques: Stangenwaffen
- ap cost: 20

---

### Formation Maneuvers

#### Formation

- type: Passive
- effect: +1 AT when fighting in formation with 3+ allies
- prerequisites: MU 13
- techniques: All
- ap cost: 10

#### Gefechtsformation (Combat Formation)

- type: Passive
- effect: +1 PA when fighting in formation with 3+ allies
- prerequisites: IN 13
- techniques: All
- ap cost: 10

#### Schildwall (Shield Wall)

- type: Passive
- effect: +2 PA for shield wall with 3+ allies using shields
- prerequisites: MU 13
- techniques: Schilde
- ap cost: 15

#### Pikenwall (Pike Wall)

- type: Passive
- effect: +2 AT vs charging enemies when 3+ allies with polearms
- prerequisites: MU 13
- techniques: Stangenwaffen
- ap cost: 15

---

### Special Weapon Maneuvers

#### Klingensturm (Blade Storm)

- type: Spezialmanöver
- at penalty: -2 per target
- effect: Attack all enemies in engagement distance (up to GS/2 targets, rounded down)
- prerequisites: GE 17, Klingentänzer
- techniques: Dolche, Fechtwaffen, Schwerter
- ap cost: 30

---

## Summary: Priority Additions

### High Priority (commonly used in combat)

1. Präziser Stich I-III - Light weapon damage dealer
2. Einhändiger Kampf - Duellist staple
3. Wurf, Schwitzkasten - Grappling chain
4. Schildschlag, Schildspalter - Shield tactics
5. Eisenhagel - Thrown weapon builds
6. Unterlaufen - Counter to reach weapons

### Medium Priority

1. Ellbogenangriff, Durchgezogener Tritt - Raufen follow-ups
2. Kernschuss, Querschuss - Ranged options
3. Festnageln, Umwickeln - Weapon control
4. Formation abilities - Group combat

### Low Priority (situational)

1. Mounted combat maneuvers
2. Special weapon maneuvers (Klingensturm)
3. Improved versions of existing abilities

---

## Sources

- DSA Regelwiki (https://dsa.ulisses-regelwiki.de/)
- Regelwerk (4. Auflage)
- Aventurisches Kompendium
- Aventurisches Kompendium 2
- Kodex des Schwertes
- Aventurisches Elementarium
