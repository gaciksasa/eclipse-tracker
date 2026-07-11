# Sunce · Zemlja · Mesec — Three.js

Realistična 3D animacija rotacije Zemlje sa Suncem i Mesecom, sa **astronomski tačnim** položajima nebeskih tela za bilo koji datum i vreme. Napravljeno u [Three.js](https://threejs.org/) uz [astronomy-engine](https://github.com/cosinekitty/astronomy) za efemeride.

## Mogućnosti

- **Realan meš Zemlje**: dnevna/noćna tekstura (svetla gradova), oblaci, odsjaj okeana, atmosferski oreol i pravi terminator (granica dan/noć).
- **Tačni položaji**: Sunce i Mesec se postavljaju iz stvarnih efemerida (RA/Dec ekvatorske koordinate datuma). Mesečeve mene, elongacija i realna udaljenost se računaju tačno.
- **Rotacija Zemlje** vezana za pravo zvezdano vreme (GAST) — subsolarna tačka (geo. širina/dužina) izlazi ispravno.
- **Senke**: Sunčeva svetlost baca senke; Zemljina senka na Mesec (pomračenje Meseca) vidljiva pri poravnanju.
- **Kontrola vremena**: pusti/pauza, ubrzavanje/usporavanje (od realnog vremena do meseci u sekundi), obrtanje smera, skok na proizvoljan datum, korak ±1h.
- **Panel podataka**: uživo prikaz UTC/lokalnog vremena, RA/Dec Sunca i Meseca, udaljenosti, faze Meseca i subsolarne tačke.

## Pokretanje

```bash
npm install
npm run textures   # preuzima teksture u public/textures (jednom)
npm run dev        # http://localhost:5173
```

Za produkciju:

```bash
npm run build
npm run preview
```

## Fokus na telo

Klikni na Zemlju, Mesec ili Sunce (ili koristi dugmad **Focus** / tastere `1` `2` `3`) i kamera doleti tako da telo bude **u centru ekrana i zauzme ~50% visine kadra**. Slobodan pogled ostaje uvek aktivan — mišem slobodno rotiraš i zumiraš. Kamera prati izabrano telo dok se kreće, pa ono ostaje u centru dok ga razgledaš. `Esc` prekida praćenje (kamera ostaje gde jeste).

## Prečice na tastaturi

| Taster | Radnja |
| --- | --- |
| `Space` | Pusti / pauza |
| `→` / `←` | Pomeri vreme za ±1 sat |
| `N` | Postavi na trenutni trenutak |
| `1` / `2` / `3` | Uokviri: Zemlja / Mesec / Sunce |
| `Esc` | Prekini praćenje |
| Miš | Rotacija kamere, točkić za zum (uvek dostupno) |

## Napomena o razmerama

Sve je u **stvarnoj (apsolutnoj) razmeri**: 1 jedinica scene = 1 srednji Zemljin poluprečnik (6371 km).

| Telo | Poluprečnik (jed.) | Udaljenost |
| --- | --- | --- |
| Zemlja | 1 | — |
| Mesec | 0.2727 | ~60 (perigej↔apogej, stvarno) |
| Sunce | 109.2 | ~23.481 (stvarno) |

Sunce se renderuje kao sfera prave veličine na pravoj udaljenosti i istovremeno je izvor svetlosti (paralelni zraci). Zbog ogromnog raspona dubine koristi se logaritamski depth buffer.

Pošto je sistem u pravoj razmeri, Zemlja izgleda malo iz kadra koji obuhvata i Mesec, a Sunce je tačkasti disk (~0.5°) daleko — to je stvarna geometrija. Zumiraj točkićem da priđeš bilo kom telu.

## Izvori tekstura

Teksture: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0) i primeri iz Three.js repozitorijuma.
