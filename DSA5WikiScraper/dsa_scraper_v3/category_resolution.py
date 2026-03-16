import re
import unicodedata
from urllib.parse import unquote, urlparse


EXPLICIT_CATEGORY_URL_RULES = {
    "rules": [
        r"(?:^|/)re_",
        r"(?:^|/)opt_",
        r"(?:^|/)gr_",
        r"(?:^|/)fokus2_",
        r"alkohol_regeln",
        r"armbrustfalle",
        r"aspekte",
        r"beleuchtung",
        r"flaschenzug",
        r"grundregeln",
        r"herumfragen",
        r"alternative_regeln",
        r"alternativregel_",
        r"magie_spezielle-",
        r"magie_grundbegriffe",
        r"nahrungssuche",
        r"orientierung_unter_tage",
        r"regel_erlaeuterungen",
        r"re_wesenstypen",
        r"spieluhr",
        r"fokusregeln",
        r"regeln_optionale",
        r"typische-r-",
        r"(?:^|/)fokus_",
        r"(?:^|/)nahkampf",
        r"(?:^|/)fernkampf",
        r"(?:^|/)herstellung/",
        r"(?:^|/)wz_",
    ],
    "species": [
        r"(?:^|/)spezies\.html",
        r"(?:^|/)spez_",
        r"(?:^|/)spezies/",
    ],
    "cultures": [
        r"(?:^|/)kul_",
        r"(?:^|/)kulturen/",
    ],
    "professions": [
        r"beherrscher_des_geistes",
        r"gildenpragung_",
        r"klingenmeister",
        r"(?:^|/)zb_",
        r"halle-der-",
        r"praegung_",
        r"seelenhirten",
        r"(?:^|/)pro_",
        r"(?:^|/)professionen/",
        r"(?:^|/)gew_",
        r"(?:^|/)animisten\.html",
        r"(?:^|/)schelme\.html",
        r"(?:^|/)zibilja\.html",
        r"(?:^|/)_geoden\.html",
        r"(?:^|/)za\.html",
        r"(?:^|/)zb\.html",
        r"(?:^|/)pro_magiedilettanten\.html",
        r"(?:^|/)pro_scharlatane\.html",
        r"(?:^|/)pro_zaubert",
    ],
    "advantages": [
        r"vorteil\.html\?vorteil=",
        r"vorteilauswahl\.html",
        r"vorteile-tiere\.html",
    ],
    "advantages_animal": [
        r"vorteile-tiere\.html",
    ],
    "disadvantages": [
        r"nachteil\.html\?nachteil=",
        r"nachteilauswahl\.html",
        r"nachteile-tiere\.html",
    ],
    "disadvantages_animal": [
        r"nachteile-tiere\.html",
    ],
    "magic": [
        r"zauber\.html\?zauber=",
        r"zaubertrick\.html\?zaubertrick=",
        r"ritual\.html\?ritual=",
        r"animistenkraft\.html\?animistenkraft=",
        r"elfenlied",
        r"hexenfluch",
        r"herrschaftsritual",
        r"schelmenstreich",
        r"zauberrune",
        r"zaubertanz",
        r"zaubermelodie",
        r"zibiljaritual",
        r"geodenritual",
        r"zauberauswahl\.html",
        r"zaubertrickauswahl\.html",
        r"ritualauswahl\.html",
    ],
    "götterwirken": [
        r"liturgie\.html\?liturgie=",
        r"segen\.html\?segen=",
        r"zeremonie\.html\?zeremonie=",
        r"predigt",
        r"vision",
        r"talisman_karmal",
        r"liturgieauswahl\.html",
        r"segenauswahl\.html",
        r"zeremonieauswahl\.html",
    ],
    "special_abilities_karmale": [
        r"(?:^|/)ag_",
        r"md_stich_",
        r"(?:^|/)zg_",
        r"allgemeine_karmale_sonderfertigkeit",
        r"liturgiestilsonderfertigkeit",
        r"erweiterte_liturgiestilsonderfertigkeit",
        r"karmale_tradition",
        r"zeremonialgegenstands_sf",
        r"predigt",
        r"vision",
    ],
    "special_abilities_magical": [
        r"(?:^|/)bz_",
        r"(?:^|/)aw_",
        r"(?:^|/)bs_",
        r"(?:^|/)ssf_",
        r"apport",
        r"gz_gewand_",
        r"allgemeine_magische_sonderfertigkeit",
        r"erw_zauber_sf",
        r"msf-",
        r"msf_",
        r"pg_",
        r"zauberstil_sf",
        r"magische_tradition",
        r"traditionsartefakt_sf",
        r"daemonenpakt",
        r"feenpakt",
        r"ahnenzeichen",
        r"bannundschutz",
        r"vampirischegaben",
        r"sikaryan-raub-sonderfertigkeiten",
    ],
    "special_abilities_profane": [
        r"(?:^|/)bf_",
        r"(?:^|/)esf_",
        r"befehl_",
        r"sf_allgemeine_sonderfertigkeiten",
        r"befehls_sf",
        r"erweiterte_talentsonderfertigkeiten",
        r"sf_erweitertekampfstilsonderfertigkeiten",
        r"sf_kampfsonderfertigkeiten",
        r"sf_kampfstilsonderfertigkeiten",
        r"sf_pruegelsonderfertigkeiten",
        r"sf_schick",
        r"talentstilsonderfertigkeiten",
        r"gift-melken",
        r"(?:^|/)eks_",
        r"(?:^|/)ksf_",
        r"(?:^|/)etsf_",
    ],
    "special_abilities_animal": [
        r"(?:^|/)sf_h_",
        r"(?:^|/)tsf_",
        r"(?:^|/)vsf_",
        r"(?:^|/)aus_",
        r"(?:^|/)trick_",
        r"(?:^|/)svf_",
        r"sf_tiere",
        r"sf_tiersonderfertigkeiten",
        r"sf_homunculus",
    ],
    "ruestkammer_artifacts": [
        r"dschinnenlampe",
        r"artefakt",
        r"rk_artefakte",
        r"wunderwerke-der-mechanik",
    ],
    "ruestkammer_equipment": [
        r"(?:^|/)ausr_",
        r"rk_buch_",
        r"rk_ausruestung",
        r"gegenstand",
        r"rk_ausr_",
        r"rk_zerg_",
        r"(?:^|/)waffenausruestung",
        r"(?:^|/)munitions?",
        r"pfeile",
        r"bolzen",
    ],
    "ruestkammer_helmets": [
        r"baburiner-hut",
        r"rs_helme",
        r"helm",
    ],
    "ruestkammer_armor_equipment": [
        r"rs_ruestungsausstattung",
    ],
    "ruestkammer_armor": [
        r"rs_ruestung",
        r"ruestung",
        r"rüstung",
        r"(?:^|/)leichte-platte",
        r"(?:^|/)isnatoscher-kettengeflecht",
        r"(?:^|/)schwere-kleidung",
        r"(?:^|/)normale-kleidung",
    ],
    "ruestkammer_weapons": [
        r"rs_waffen",
        r"waffe",
        r"degen",
        r"schild",
        r"kampftechnik",
        r"(?:^|/)dolche\.html",
        r"(?:^|/)armbrueste\.html",
        r"(?:^|/)zweihandschwerter\.html",
        r"(?:^|/)hiebwaffen\.html",
        r"(?:^|/)stangenwaffen\.html",
        r"(?:^|/)wurfwaffen\.html",
        r"(?:^|/)boegen\.html",
    ],
    "bestiarium": [
        r"(?:^|/)best_",
        r"(?:^|/)best-",
        r"bestiarium",
        r"elementare",
        r"geister",
    ],
    "herbarium": [
        r"(?:^|/)her_",
        r"(?:^|/)herb_",
        r"herbarium",
    ],
    "poisons_and_illnesses": [
        r"aventurische_krankheiten",
        r"(?:^|/)gr_krankheiten",
        r"(?:^|/)gr_gifte",
        r"(?:^|/)krank_",
        r"(?:^|/)gift_",
    ],
}


EXPLICIT_BREADCRUMB_RULES = {
    "rules": ["regeln", "grundregeln", "fokusregeln", "heldenerschaffung", "herstellung", "kampfregeln"],
    "species": ["spezies"],
    "cultures": ["kulturen", "kultur"],
    "professions": ["professionen", "profession", "geweihte", "zauberer"],
    "advantages": ["vorteile"],
    "advantages_animal": ["vorteile tiere", "tiervorteile"],
    "disadvantages": ["nachteile"],
    "disadvantages_animal": ["nachteile tiere", "tiernachteile"],
    "magic": ["magie", "zauber", "rituale", "zaubertricks", "elfenlieder", "animistenkräfte"],
    "götterwirken": ["götterwirken", "goetterwirken", "liturgien", "zeremonien", "segen"],
    "special_abilities_karmale": ["karmale sonderfertigkeiten"],
    "special_abilities_magical": ["magische sonderfertigkeiten", "paktgeschenke", "zauberzeichen", "ahnenzeichen", "traditionsartefakt sonderfertigkeiten", "sikaryan raub sonderfertigkeiten"],
    "special_abilities_profane": ["profane sonderfertigkeiten", "kampfstilsonderfertigkeiten", "erweiterte kampfstilsonderfertigkeiten", "kampfsonderfertigkeiten", "talentstilsonderfertigkeiten"],
    "special_abilities_animal": ["tiersonderfertigkeiten", "vertrautensonderfertigkeiten", "ausbildungsaufsatze", "ausbildungsaufsätze", "tricks"],
    "ruestkammer_artifacts": ["artefakte"],
    "ruestkammer_equipment": ["rustkammer ausrustung", "rüstkammer ausrüstung", "waffenausrustung", "waffenausrüstung", "munition", "besondere munitionsarten"],
    "ruestkammer_helmets": ["rustkammer helme", "rüstkammer helme"],
    "ruestkammer_armor_equipment": ["rustkammer rustungsausstattung", "rüstkammer rüstungsausstattung"],
    "ruestkammer_armor": ["rustkammer rustung", "rüstkammer rüstung", "plattenrustung", "plattenrüstung", "kettenrustung", "kettenrüstung", "regulare plattenrustungen", "reguläre plattenrüstungen", "regulare kettenrustungen", "reguläre kettenrüstungen"],
    "ruestkammer_weapons": ["rustkammer waffen", "rüstkammer waffen", "regulare schwerter", "reguläre schwerter", "regulare stangenwaffen", "reguläre stangenwaffen", "regulare hiebwaffen", "reguläre hiebwaffen", "regulare zweihandschwerter", "reguläre zweihandschwerter", "armbruste", "armbrüste"],
    "bestiarium": ["bestiarium", "tiere", "untote", "drachen", "dämonen", "daemonen"],
    "herbarium": ["herbarium", "pflanzen"],
    "poisons_and_illnesses": ["gifte", "krankheiten"],
}


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_value = ascii_value.lower()
    ascii_value = re.sub(r"[^a-z0-9]+", " ", ascii_value)
    return re.sub(r"\s+", " ", ascii_value).strip()


def get_url_category_candidates(url: str) -> list[str]:
    parsed = urlparse(url)
    raw_url = unquote(parsed.path + (f"?{parsed.query}" if parsed.query else "")).lower()
    normalized_url = normalize_text(raw_url)
    matches = []
    for category, patterns in EXPLICIT_CATEGORY_URL_RULES.items():
        if any(re.search(pattern, raw_url) or re.search(pattern, normalized_url) for pattern in patterns):
            matches.append(category)
    return matches


def get_breadcrumb_category_candidates(breadcrumbs: list[str], title: str = "") -> list[str]:
    normalized_parts = [normalize_text(part) for part in breadcrumbs]
    if title:
        normalized_parts.append(normalize_text(title))
    combined = " | ".join(part for part in normalized_parts if part)
    if not combined:
        return []

    matches = []
    for category, tokens in EXPLICIT_BREADCRUMB_RULES.items():
        if any(token in combined for token in tokens):
            matches.append(category)
    return matches


def get_property_category_candidates(properties: dict[str, str]) -> list[str]:
    normalized_labels = {normalize_text(label) for label in properties}
    matches = []

    if {"wirkung", "probe", "asp kosten", "zauberdauer"} & normalized_labels:
        matches.append("magic")
    if {"kap", "liturgiedauer", "zeremoniedauer"} & normalized_labels:
        matches.append("götterwirken")
    if {"ruckungsschutz", "rustungsschutz", "tp kk", "kampftechnik", "preis", "gewicht"} & normalized_labels:
        matches.append("ruestkammer_weapons")
    if {"rustungsvorteil", "rustungsnachteil", "rs", "be"} & normalized_labels:
        matches.append("ruestkammer_armor")
    if {"typus", "grosse", "lep", "aup", "mr"} & normalized_labels:
        matches.append("bestiarium")
    if {"kulturkunde", "kulturtalente", "kultursonderfertigkeiten"} & normalized_labels:
        matches.append("cultures")
    if {"mogliche kulturen", "professionstyp", "grundtalente"} & normalized_labels:
        matches.append("professions")

    return matches


def resolve_final_category(
    *,
    url: str,
    breadcrumbs: list[str],
    title: str,
    properties: dict[str, str],
    crawl_sources: list[str],
    provisional_category: str | None,
) -> tuple[str | None, str, list[str]]:
    scores: dict[str, int] = {}
    evidence: dict[str, list[str]] = {}

    def add_score(category: str, points: int, reason: str):
        scores[category] = scores.get(category, 0) + points
        evidence.setdefault(category, []).append(reason)

    if provisional_category:
        add_score(provisional_category, 100, "provisional_category")

    url_candidates = get_url_category_candidates(url)
    if len(url_candidates) == 1:
        add_score(url_candidates[0], 90, "url_pattern")
    else:
        for category in url_candidates:
            add_score(category, 45, "url_pattern_ambiguous")

    breadcrumb_candidates = get_breadcrumb_category_candidates(breadcrumbs, title)
    if len(breadcrumb_candidates) == 1:
        add_score(breadcrumb_candidates[0], 80, "breadcrumb")
    else:
        for category in breadcrumb_candidates:
            add_score(category, 35, "breadcrumb_ambiguous")

    for category in get_property_category_candidates(properties):
        add_score(category, 25, "properties")

    for category in crawl_sources:
        add_score(category, 10, "crawl_source")

    if not scores:
        return None, "none", []

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top_category, top_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else -1

    if top_score < 60:
        return None, "low", evidence.get(top_category, [])
    if second_score >= top_score - 10:
        return None, "ambiguous", evidence.get(top_category, [])

    confidence = "high" if top_score >= 100 else "medium"
    return top_category, confidence, evidence.get(top_category, [])
