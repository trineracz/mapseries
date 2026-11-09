# Mapseries — modernizace technologického stacku

**Aplikace:** Mapseries (Mapová díla online) — katalog a editor mapových sérií MZK
**Cíl migrace:** odstranění zastaralého a nepodporovaného stacku (WildFly/JSF/Java EE) a převod na moderní, udržovaný a snadno provozovatelný základ.
**Zásada:** z pohledu uživatele beze změny funkcí — stejné chování, stejné obrazovky, jen moderní a udržovatelný základ. Případné drobnosti pouze opraveny.

---

## 1. Shrnutí

Původní aplikace stála na kombinaci technologií, které **už nedostávají aktualizace ani bezpečnostní záplaty** (viz tabulka níže — nejkritičtější je CentOS 7, konec podpory 30. 6. 2024, a PostgreSQL 10, konec podpory 10. 11. 2022). Provoz i další vývoj na tomto základě je rizikový (bezpečnost) a pomalý (mrtvé nástroje, těžký aplikační server, EOL build).

Aplikace byla přepsána na **Spring Boot 3.3 / Java 17 (LTS)** s vestavěným serverem, moderní perzistencí a build/runtime image, které jsou aktivně podporované. **Funkčnost z pohledu uživatele zůstává stejná.**

Migrace je **funkčně kompletní** — katalog, editor i administrace běží na novém stacku a byly průběžně ověřovány proti původní verzi. Projekt je ve stavu **připraveném k nasazení** (viz sekce 7).

---

## 2. Technologie po konci podpory (proč byla změna nezbytná)

| Technologie (původní) | Verze | Konec podpory / stav | Dopad |
|---|---|---|---|
| **CentOS 7** (základní image WildFly) | 7 | **EOL 30. 6. 2024** | Žádné bezpečnostní záplaty OS; build se už ani nedal sestavit bez ručních obezliček (mrtvé mirrory → přesměrování na `vault.centos.org`). |
| **PostgreSQL 10** | 10 | **EOL 10. 11. 2022** | Databáze bez bezpečnostních aktualizací. |
| **Node.js 9** (build frontendu) | 9.x | **EOL 30. 6. 2018** | Build frontendu na dávno mrtvém Node; nutné pinovat `gulp-cli` na starou verzi, jinak nešlo sestavit. |
| **WildFly** | 16.0.0.Final | vydán **2/2019**, komunitní verze bez dalších aktualizací | Těžký aplikační server, žádné záplaty pro tuto verzi. |
| **Java** | 8 (1.8) | Oracle veřejné aktualizace zdarma **ukončeny 1/2019** | Zastaralá běhová platforma. |
| **JSF (JavaServer Faces) 2.2** | `javax.faces` | jmenný prostor `javax.*` **zmrazen (2019/2020)**, nahrazen `jakarta.*` | Slepá vývojová větev — do budoucna bez podpory. |
| **EJB 3.2, JMS 2.0 (MDB), WebSocket 1.1** | `javax.*` Java EE | tytéž `javax.*` specifikace **zmrazeny** | Těžké Java EE komponenty vázané na aplikační server. |
| **CoffeeScript / gulp 3 / webpack (starý)** | — | CoffeeScript i gulp 3 **fakticky opuštěné (od ~2018)** | Neudržované build nástroje frontendu. |

> Klíčové sdělení: **nejde o kosmetiku.** Několik z těchto technologií je za koncem podpory o **2–7 let** a build původní aplikace se dnes bez ručních zásahů ani nesestaví.

---

## 3. Původní → nový stack (mapování 1:1)

| Vrstva | Původně | Nově | Poznámka |
|---|---|---|---|
| Běhová platforma | Java 8 | **Java 17 (LTS)** | LTS s podporou do ~2029+. |
| Aplikační server | WildFly 16 (externí) | **vestavěný Tomcat** (Spring Boot) | Žádný samostatný app server; app = jeden `jar`. |
| Framework | Java EE (JSF/EJB/CDI) | **Spring Boot 3.3.5** | Aktivně vyvíjený, standard v ekosystému. |
| Web / šablony | JSF 2.2 + Facelets (`.xhtml`) | **Thymeleaf** | Stejné obrazovky, URL `*.xhtml` zachovány kvůli kompatibilitě. |
| Perzistence | Hibernate EntityManager (staré JPA) | **Spring Data JPA** | Stejný datový model, moderní přístup. |
| Databáze | PostgreSQL 10 (EOL) | **PostgreSQL** (aplikace nezávislá na verzi) | Datový model beze změny; upgrade na podporovanou verzi je nyní bez překážek. |
| Harvest na pozadí | JMS + Message-Driven Bean | **`@Async` (Spring)** | Odstraněna celá fronta JMS/MDB. |
| Živá aktualizace UI | WebSocket (server push) | **polling REST endpointu** | Jednodušší, bez WebSocket infrastruktury; UI se chová stejně. |
| HTTP volání (GitHub, Kramerius) | Apache HttpClient + egit | **Spring `RestClient`** | Méně závislostí. |
| Konfigurace | `standalone-full.xml` (WildFly) | **`@ConfigurationProperties` + proměnné prostředí** | Konfigurace přes `.env` / env vars. |
| Build & runtime image | CentOS 7 + WildFly | **`maven:3.9-eclipse-temurin-17` → `eclipse-temurin:17-jre`** | Vícefázový build; malý, udržovaný runtime image. |
| Build frontendu | Node 9 + gulp 3 + CoffeeScript | statické assety servírované přímo Spring Bootem | Odpadá mrtvý build řetězec. |

---

## 4. Co se z pohledu uživatele změnilo

**Nic funkčně.** Katalog, editor sérií i administrace fungují stejně:

- **Katalog** (veřejný) — vyhledávání, zobrazení sérií na mapě, detail listů, náhledy z Krameria, přepínání jazyka CZ/EN.
- **Editor** (`/edit`) — zakládání a úpravy sérií, zápis změn na GitHub. (Ponechán do schválení nové administrace, viz 4a.)
- **Administrace** (`/admin`) — přihlášení přes GitHub OAuth, správa obsahu, editor textů, správci, harvest (spuštění + rollback verzí), detekce nenavázaných map.

Opravené drobnosti během migrace (technické, uživatel je nepozná jako „novou funkci"):
- Náhledy z Krameria — přepnuty na aktuální API `api.kramerius.mzk.cz` (v7 IIIF); starý endpoint byl vyřazen z provozu.
- Ikona vlajky přepínače jazyků — opraveno poškození CSS při přenosu.
- `/admin/` (s lomítkem) — doplněno chybějící přesměrování.

---

## 4a. Druhá etapa: zjednodušení katalogizace a správy šablon

Na modernizovaném základu navazují úpravy, které katalogizaci zrychlují a omezují chyby. Šablona a Národní autority ČR jsou zdrojem pravdy; údaje určující identitu (korporace a její kód $7, indikátory, kódy v 008) se vybírají, přepisové údaje (245 $c, 260/264) zůstávají upravitelné.

**Katalogizační nástroj (`/catalog`)**
- Hledání korporací v Národních autoritách ČR v polích 110 a 710 (název, kód $7 a indikátor se vloží najednou). Autority se jednou týdně stahují z úplného exportu NK ČR.
- Kontrola záznamu při kopírování: seznam chyb (délka 008, chybějící korporace, kód autority, nakladatelské údaje, rozměry), označená pole a odkaz do editoru šablony daného díla.
- Hodnotu, která v šabloně chybí, lze jedním odkazem připravit k doplnění do šablony.
- Prázdná pole 7XX se do záznamu nekopírují.

**Administrace (`/admin`)** — uspořádaná podle toho, jak spolu data souvisejí:
- *Katalogizace → Mapová díla*: seznam děl, název a zařazení díla, šablona ve formulářovém editoru (tabulka korporací a navázaných polí, nabídky, všechna pole záznamu včetně předmětových hesel z NK, kontrola vazeb) i v textu; průvodce založením nového díla.
- *Veřejný web → Série, Aktualizace, Nepřiřazené mapy* (u nepřiřazených záznamů důvod a odkazy na VuFind a sken).
- *Společné → Mřížky* (editor mřížky listů, import a export GeoJSON/KML/CSV/WKT) a *Správa uživatelů*.
- Každé uložení vytvoří návrh změny (pull request) ke schválení; mění jen skutečně upravené řádky a bez změny návrh nevzniká.

**Opravy dat šablon** (ověřené proti Národním autoritám a záznamům v Alephu) se připravují jako samostatné návrhy změn ke schválení.

---

## 5. Architektura po migraci (stručně)

- **OAI-PMH harvest** z Alephu (`aleph.mzk.cz/OAI`, set `MZK01-MAPY`) → parsování MARC21 → PostgreSQL. Běží asynchronně přes `@Async`.
- **GitHub jako datové úložiště** — série a definice obsahu jsou v repozitáři `mapseries-data`. Aplikace má oddělené **čtení** a **zápis** (viz nasazení níže).
- **Náhledy** map z Krameria (IIIF).
- **Verzování dat** — každý harvest je verze; lze se vrátit (rollback) na předchozí.

---

## 6. Postup migrace

1. Stará aplikace ponechána v běhu jako **referenční „oracle"** (paralelně na portu `:8081`) pro průběžné porovnávání chování 1:1.
2. Nová aplikace portována **po vrstvách**, každý ucelený krok ověřen proti staré verzi.
3. Průběžné ověřování všech endpointů, harvestu i administrace.

---

## 7. Příprava na nasazení

Aplikace je funkčně kompletní a připravená k nasazení. Nasazení do produkce je přímočaré a spočívá ve standardních krocích:

- **Konfigurace zdroje dat** — plně řízená proměnnými prostředí (`.env`), nic není napevno v kódu:
  - `MAPSERIES_REPO_USER` / `MAPSERIES_REPO_NAME` — odkud se **čte**
  - `MAPSERIES_REPO_WRITE_USER` / `MAPSERIES_REPO_WRITE_NAME` — kam se **zapisuje**
  - `MAPSERIES_REPO_PR_USER` / `MAPSERIES_REPO_PR_NAME` — kde vznikají **návrhy změn** (nevyplněno = repozitář pro čtení, tj. produkční chování)
  - `MAPSERIES_AUTHORITY_CRON` — pravidelná aktualizace Národních autorit (např. `0 0 3 * * SUN`)
- **Testovací nasazení** — běží na vývojovém serveru (`mapseries.trinera.dev`) nad samostatnou kopií dat; čte i zapisuje jen tuto kopii, do produkčních dat nezapisuje.
- **Schválení GitHub OAuth aplikace** v produkční organizaci (`moravianlibrary`) — standardní jednorázový krok, po kterém prochází i zápis změn (commit).
- **Runtime** — jeden `jar` ve vestavěném Tomcatu (image `eclipse-temurin:17-jre`), spouštěný přes `docker compose`. Žádný externí aplikační server.
- **Upgrade databáze** — vhodné při nasazení povýšit PostgreSQL z EOL verze 10 na aktuálně podporovanou; aplikace je na verzi DB nezávislá a datový model se nemění.

---

## 8. Přínos

- **Bezpečnost:** pryč od OS a DB po konci podpory (CentOS 7, PostgreSQL 10) a od zmrazených `javax.*` specifikací.
- **Udržovatelnost:** standardní Spring Boot stack, jeden `jar`, žádný externí aplikační server, žádný mrtvý frontend build.
- **Rychlost vývoje:** moderní, dobře zdokumentovaný ekosystém — výrazně snazší další úpravy.
- **Beze změny pro uživatele:** stejné funkce a chování.
