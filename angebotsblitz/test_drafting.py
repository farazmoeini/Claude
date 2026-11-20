"""Run: python -m pytest -q   (from this folder)"""
import drafting
import pdf

PRICES = [
    {"id": 1, "name": "Altbelag Fliesen entfernen", "unit": "m²", "price": 28.0, "keywords": "alte fliesen raus,abbruch"},
    {"id": 2, "name": "Bodenfliesen verlegen", "unit": "m²", "price": 58.0, "keywords": "bodenfliesen,neue fliesen"},
    {"id": 3, "name": "Wandfliesen verlegen", "unit": "m²", "price": 62.0, "keywords": "wandfliesen,fliesenspiegel"},
    {"id": 4, "name": "Silikonfugen erneuern", "unit": "lfm", "price": 9.5, "keywords": "silikon,fugen"},
    {"id": 5, "name": "WC montieren", "unit": "Stk", "price": 240.0, "keywords": "wc,toilette"},
    {"id": 6, "name": "Arbeitsstunde", "unit": "Std", "price": 58.0, "keywords": "stunde,stunden"},
]


def items(text):
    return {i["price_id"]: (i["qty"], i["unit"]) for i in drafting.draft_rules(text, PRICES)["items"]}


def test_area_and_perimeter_from_room_dimensions():
    r = items("Bad 3 x 2,5 m, alte Fliesen raus, neue Fliesen, Silikon")
    assert r[1] == (7.5, "m²") and r[2] == (7.5, "m²") and r[4] == (11.0, "lfm")


def test_decimal_comma_is_not_a_separator():
    assert items("Küche Fliesenspiegel 4,5 qm")[3] == (4.5, "m²")


def test_explicit_quantities_win():
    r = items("Bad 6 m², Wandfliesen 18 m², 3 Stunden, Toilette")
    assert r[3] == (18.0, "m²") and r[6] == (3.0, "Std") and r[5] == (1, "Stk")


def test_tile_format_is_not_a_quantity():
    assert items("Bad 6 m², Bodenfliesen 60x60")[2] == (6.0, "m²")


def test_totals_with_vat_and_kleinunternehmer():
    its = [{"qty": 7.5, "price": 28.0}, {"qty": 1, "price": 65.0}]
    assert pdf.totals(its, {"vat_rate": 19}) == {"net": 275.0, "rate": 19.0, "vat": 52.25, "gross": 327.25}
    assert pdf.totals(its, {"vat_rate": 19, "kleinunternehmer": True})["gross"] == 275.0
