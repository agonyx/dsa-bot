import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dsa_scraper_v3"))

import category_resolution


class CategoryResolutionTests(unittest.TestCase):
    def test_verified_missing_url_families_now_map_to_categories(self):
        cases = {
            "https://dsa.ulisses-regelwiki.de/AG_freundschaft_des_tieres.html": ["special_abilities_karmale"],
            "https://dsa.ulisses-regelwiki.de/AW_Leuchtkraft.html": ["special_abilities_magical"],
            "https://dsa.ulisses-regelwiki.de/AlternativRegel_1W20-Probe.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/WZ_1_Achaz.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/sf_h_alraunenbeere.html": ["special_abilities_animal"],
            "https://dsa.ulisses-regelwiki.de/RK_ZerG_BuchSchlange.html": ["ruestkammer_equipment"],
            "https://dsa.ulisses-regelwiki.de/mSF-AZZ-Leuchtkraft.html": ["special_abilities_magical"],
            "https://dsa.ulisses-regelwiki.de/Ausr_Holzschale.html": ["ruestkammer_equipment"],
            "https://dsa.ulisses-regelwiki.de/BS_Apport.html": ["special_abilities_magical"],
            "https://dsa.ulisses-regelwiki.de/Befehl_Klammerangriff.html": ["special_abilities_profane"],
            "https://dsa.ulisses-regelwiki.de/Alkohol_Regeln.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/typische-r-andergaster-in-stufe-i.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/md_stich_der_furcht.html": ["special_abilities_karmale"],
            "https://dsa.ulisses-regelwiki.de/RE_Wesenstypen_Golems.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/GZ_Gewand_der_Heilung.html": ["special_abilities_magical"],
            "https://dsa.ulisses-regelwiki.de/RK_Buch_Vademecum.html": ["ruestkammer_equipment"],
            "https://dsa.ulisses-regelwiki.de/Magie_Spezielle-Regeln-fuer-Spruchzauber_Verwandlungsregeln.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/BF_Flugangriff.html": ["special_abilities_profane"],
            "https://dsa.ulisses-regelwiki.de/BZ_BannschwertdesAdepten.html": ["special_abilities_magical"],
            "https://dsa.ulisses-regelwiki.de/ESF_Geschickter_Wurf.html": ["special_abilities_profane"],
            "https://dsa.ulisses-regelwiki.de/Dolch-Apport.html": ["special_abilities_magical"],
            "https://dsa.ulisses-regelwiki.de/Dschinnenlampe.html": ["ruestkammer_artifacts"],
            "https://dsa.ulisses-regelwiki.de/Aventurische_Krankheiten.html": ["poisons_and_illnesses"],
            "https://dsa.ulisses-regelwiki.de/RE_AufbauKreaturenbeschreibung.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/Beleuchtung.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/Orientierung_unter_Tage.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/Magie_Grundbegriffe-der-Zauberei.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/Opt_Weniger_Regeneration.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/ZG_MachtSchicksal.html": ["special_abilities_karmale"],
            "https://dsa.ulisses-regelwiki.de/fokus2_Krautersuche_in_spezifischen_Regionen.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/Herumfragen.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/Nahrungssuche.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/armbrustfalle.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/flaschenzug.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/spieluhr.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/klingenmeister.html": ["professions"],
            "https://dsa.ulisses-regelwiki.de/beherrscher_des_geistes.html": ["professions"],
            "https://dsa.ulisses-regelwiki.de/seelenhirten.html": ["professions"],
            "https://dsa.ulisses-regelwiki.de/gildenpragung_Progressiv.html": ["professions"],
            "https://dsa.ulisses-regelwiki.de/praegung_kristallomant_menschenversteher.html": ["professions"],
            "https://dsa.ulisses-regelwiki.de/halle-der-macht-zu-lowangen.html": ["professions"],
            "https://dsa.ulisses-regelwiki.de/ZB_Ceoladir.html": ["professions"],
            "https://dsa.ulisses-regelwiki.de/aspekte.html": ["rules"],
            "https://dsa.ulisses-regelwiki.de/SSF_Telekineseschlag.html": ["special_abilities_magical"],
            "https://dsa.ulisses-regelwiki.de/degen.html": ["ruestkammer_weapons"],
            "https://dsa.ulisses-regelwiki.de/baburiner-hut.html": ["ruestkammer_helmets"],
        }

        for url, expected in cases.items():
            with self.subTest(url=url):
                self.assertEqual(category_resolution.get_url_category_candidates(url), expected)


if __name__ == "__main__":
    unittest.main()
