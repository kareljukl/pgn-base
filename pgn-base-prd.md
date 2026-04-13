# PGN Base — Product Requirements Document (MVP)

## 1. Přehled projektu

**Název:** PGN Base  
**Účel:** Webová aplikace pro správu, prohlížení a analýzu šachových databází ve formátu PGN.  
**Cílová skupina:** Kluboví šachisté, primárně uživatelé z jednoho šachového klubu.  
**Jazyk kódu:** Angličtina (komentáře, proměnné, názvy funkcí).  
**Jazyk UI:** Čeština.

---

## 2. Uživatelské role

| Role | Popis |
|------|-------|
| `admin` | Spravuje uživatele, má přístup ke všem databázím |
| `user` | Standardní přihlášený uživatel, spravuje vlastní databáze |
| `guest` | Nepřihlášený návštěvník — pouze čtení veřejných databází |

---

## 3. Autentizace

- Přihlášení výhradně přes **Google OAuth 2.0**
- Při prvním přihlášení se vytvoří uživatelský účet automaticky
- Admin schvaluje nebo blokuje účty (výchozí stav nového účtu: `active`)
- Nepřihlášení uživatelé vidí pouze veřejné databáze v režimu read-only

---

## 4. Databáze (kolekce partií)

### 4.1 Správa

- Každý uživatel může mít **max. 50 databází**
- Operace: vytvořit, přejmenovat, smazat
- Každá databáze má: název, popis (volitelný), datum vytvoření
- Databáze může být **soukromá** (výchozí) nebo **veřejná**

### 4.2 Veřejné databáze

- Dostupné bez přihlášení přes veřejnou URL
- Plná funkcionalita prohlížení a analýzy
- Změny (editace, přidání partie) zůstanou pouze v prohlížeči (session storage)
- Po opuštění stránky nebo obnovení se změny zahodí
- Není možné uložit změny zpět do databáze

---

## 5. Partie

### 5.1 Import

- Nahrání **PGN souboru** (jeden soubor, více partií)
- Vložení PGN textu přes **textarea** (paste)
- Validace formátu před importem
- Zobrazení počtu nalezených partií před potvrzením importu
- Duplicity nejsou řešeny v MVP (uloží se vše)

### 5.2 Zobrazení seznamu partií

Tabulka s sloupci:
- Bílý hráč (jméno + ELO)
- Černý hráč (jméno + ELO)
- Výsledek
- Datum
- Event (název turnaje)
- Round/Board

Funkce:
- Řazení podle libovolného sloupce
- Filtrování podle jména hráče (fulltext search přes White + Black)
- Stránkování (25 partií na stránku)
- Klik na partii → otevře prohlížení

### 5.3 Prohlížení partie

- Šachovnice s přehráváním tahů (Chessground)
- Navigace: první tah, předchozí, další, poslední tah + klávesy ← →
- Zobrazení tahů jako scrollovatelný seznam vedle šachovnice
- Klik na tah v seznamu → skok na danou pozici
- Zobrazení komentářů u tahů
- Zobrazení glyfů (NAG) — ikony pro $1 Dobrý tah, $2 Chyba, $3 Skvělý tah, $4 Hrubá chyba, $6 Sporný tah atd.
- Podpora větvení — varianty zobrazeny v seznamu tahů, navigace do větve a zpět

### 5.4 Analýza

- **Stockfish WASM** běžící v Web Workeru
- Zobrazení hodnocení pozice (score v pawnech, mate in N)
- Zobrazení nejlepšího pokračování (principal variation)
- Hloubka analýzy nastavitelná
- **Lichess Opening Explorer API** — strom zahájení pro aktuální pozici:
  - Masters databáze (velké turnaje)
  - Zobrazení nejčastějších tahů, počet partií, % výher bílého/remíza/výhra černého

### 5.5 Export

- Export vybrané partie nebo celé databáze jako `.pgn` soubor
- Dva režimy:
  - **Plné PGN** — včetně komentářů, variant, NAG anotací
  - **Stripped PGN** — pouze tahy, bez komentářů a variant

---

## 6. Uživatelské rozhraní

### 6.1 Navigace

```
[ PGN Base ]  [ Moje databáze ]  [ Veřejné databáze ]       [ Jan Novák ▾ ]
```

### 6.2 Stránky

| Stránka | URL | Popis |
|---------|-----|-------|
| Přihlášení | `/login` | Google OAuth tlačítko |
| Moje databáze | `/` | Seznam vlastních databází |
| Detail databáze | `/db/:id` | Seznam partií v databázi |
| Prohlížení partie | `/db/:id/game/:gameId` | Šachovnice + analýza |
| Veřejné databáze | `/public` | Seznam veřejných databází |
| Veřejná databáze | `/public/:id` | Read-only verze databáze |

### 6.3 Layout prohlížení partie

```
┌─────────────────────────────────────────────────────────┐
│  Kubaljak Jaromír (2100)           Fiala Jan (1850)     │
├────────────────────┬────────────────────────────────────┤
│                    │  1. e4    e5                        │
│   ŠACHOVNICE       │  2. Nf3   Nc6                       │
│   (Chessground)    │  3. Bb5   a6  { Morphy obrana }    │
│                    │    (3... Nf6 { Berlínská }          │
│                    │      4. O-O )                       │
│                    │  4. Ba4   Nf6                       │
├────────────────────┤─────────────────────────────────────┤
│  ◀◀  ◀  ▶  ▶▶     │  Stockfish 18 · +0.3               │
├────────────────────┴────────────────────────────────────┤
│  STROM ZAHÁJENÍ (Lichess Opening Explorer)              │
│  Tah    Partie    Bílý / Remíza / Černý                 │
│  e4     45%  1.3M   32%    44%    24%                   │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Co není součástí MVP

- Editace tahů a hlaviček (Fáze 2)
- Vytváření partie od nuly přes šachovnici (Fáze 2)
- Komentáře a glyfy přes UI — zobrazení ano, editace ne (Fáze 2)
- Admin panel (Fáze 2)
- Sdílené klubové databáze (Fáze 3)
- Mobile optimalizace (Fáze 3)
